import { createTestDatabase, type TestDatabase } from '@waveger/db/testing'
import { chartWeekSchema } from '@waveger/domain'
import { afterEach, beforeEach, expect, test } from 'vitest'
import { createApi } from '../app'
import verifiedRun from '../chart/fixtures/uk-singles-2026-07-31.json'
import { createFixtureChartSource } from '../chart/fixture-source'
import { exponentialBackoffMs, type RetryPolicy } from '../chart/retry'
import {
  ChartSourceError,
  type ChartSource,
  type ResumeCursor,
} from '../chart/source'

/**
 * Ingestion, driven through its route against a real Postgres, with the
 * fixture `ChartSource` injected. Nothing else is substituted: the archive
 * these tests assert on is the one a visitor reads.
 */

let database: TestDatabase

/**
 * The operator secret this file's API is built with, sent on every
 * `/api/internal/*` call below. Real, not bypassed: the guard these tests run
 * through is the one a deployment runs (ADR 0011).
 */
const OPERATOR_SECRET = 'test-operator-secret'

/**
 * The real retry policy with the waiting taken out.
 *
 * `backoffMs` is the production function, so the delays asserted below are the
 * ones a deployment would use; only `sleep` is replaced, and it records what it
 * was asked to wait instead of waiting it. A suite that actually slept would
 * spend six seconds proving a source failed.
 */
function retryPolicy(attempts = 3) {
  const waits: number[] = []
  const policy: RetryPolicy = {
    attempts,
    backoffMs: exponentialBackoffMs,
    sleep: (ms) => {
      waits.push(ms)
      return Promise.resolve()
    },
  }
  return { policy, waits }
}

const apiFor = (
  source = createFixtureChartSource(),
  ingestionRetry: RetryPolicy = retryPolicy().policy,
) =>
  createApi({
    db: database.db,
    chartSource: source,
    operatorSecret: OPERATOR_SECRET,
    ingestionRetry,
  })

const ingest = (api: ReturnType<typeof createApi>, body: unknown) =>
  api.request('/api/internal/ingest', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${OPERATOR_SECRET}`,
    },
    body: JSON.stringify(body),
  })

const VERIFIED_WEEK = { chart: 'uk-singles', date: '2026-07-31' }

/** A source holding one run of the verified week, altered as described. */
const sourceServing = (records: readonly unknown[]) =>
  createFixtureChartSource({ 'uk-singles/2026-07-31': records })

/** The verified week's own records, for a test to spoil. */
const records = verifiedRun as readonly Record<string, unknown>[]

const heldChartWeek = async (api: ReturnType<typeof createApi>) => {
  const response = await api.request('/api/v1/chart-weeks/latest')
  return response.status === 404
    ? null
    : chartWeekSchema.parse(await response.json())
}

const runsFor = async (
  api: ReturnType<typeof createApi>,
  id = VERIFIED_WEEK,
) => {
  const response = await api.request(
    `/api/internal/runs?chart=${id.chart}&date=${id.date}`,
    { headers: { authorization: `Bearer ${OPERATOR_SECRET}` } },
  )
  expect(response.status).toBe(200)
  const body = (await response.json()) as { runs: unknown[] }
  return body.runs
}

beforeEach(async () => {
  database = await createTestDatabase()
})

afterEach(async () => {
  await database.dispose()
})

test('ingesting the verified Chart Week puts the whole week in the archive', async () => {
  const api = apiFor()

  const run = await ingest(api, VERIFIED_WEEK)

  expect(run.status).toBe(200)
  expect(await run.json()).toMatchObject({
    status: 'succeeded',
    chart: 'uk-singles',
    date: '2026-07-31',
    entries: 100,
  })

  const response = await api.request('/api/v1/chart-weeks/latest')
  const week = chartWeekSchema.parse(await response.json())

  expect(week.date).toBe('2026-07-31')
  expect(week.chart.name).toBe('UK Official Singles Chart')
  expect(week.entries).toHaveLength(100)
  // One week ingested is one week held, so there is no predecessor to derive
  // movement against and every Entry says so. `movement.test.ts` has the rest.
  expect(week.entries[0]).toEqual({
    position: 1,
    title: 'REIN ME IN',
    artist: 'SAM FENDER & OLIVIA DEAN',
    peakPosition: 1,
    weeksOnChart: 59,
    movement: { kind: 'unknown' },
  })
  expect(week.entries.at(-1)).toEqual({
    position: 100,
    title: '2007',
    artist: 'CHARLI XCX',
    peakPosition: 100,
    weeksOnChart: 1,
    movement: { kind: 'unknown' },
  })
  expect(week.exits).toEqual([])
})

test('a successful run is recorded, with the payload kept for a replay', async () => {
  const api = apiFor()

  await ingest(api, VERIFIED_WEEK)

  expect(await runsFor(api)).toEqual([
    expect.objectContaining({
      status: 'succeeded',
      failure: null,
      flags: [],
      payloadStored: true,
    }),
  ])
})

test("a Chart Week short of the Chart's Position count is refused whole", async () => {
  const api = apiFor(sourceServing(records.slice(0, 99)))

  const run = await ingest(api, VERIFIED_WEEK)

  expect(run.status).toBe(502)
  expect(await run.json()).toMatchObject({
    error: 'chart_week_rejected',
    message: expect.stringContaining('has 99 Entries; uk-singles has 100'),
  })
  expect(await heldChartWeek(api)).toBeNull()
})

test('a rejected run leaves the archive untouched and is recorded as failed', async () => {
  const api = apiFor(sourceServing(records.slice(0, 99)))

  await ingest(api, VERIFIED_WEEK)

  expect(await heldChartWeek(api)).toBeNull()
  expect(await runsFor(api)).toEqual([
    expect.objectContaining({
      status: 'failed',
      failure: expect.stringContaining('99 Entries'),
      // Kept even though nothing was held: the run can be replayed against
      // changed parsing without paying the actor for the fetch again.
      payloadStored: true,
    }),
  ])
})

test('a Chart Week with two Entries at one Position is refused whole', async () => {
  const duplicated = records.map((record, index) =>
    index === 41 ? { ...record, rank: 12 } : record,
  )

  const run = await ingest(apiFor(sourceServing(duplicated)), VERIFIED_WEEK)

  expect(run.status).toBe(502)
  expect(await run.json()).toMatchObject({
    error: 'chart_week_rejected',
    message: expect.stringContaining('two Entries at Position 12'),
  })
})

/**
 * A Song at two Positions is not a Chart Week, and refusing it is what the
 * movement self-join stands on. Entries are keyed on Chart Week and Position,
 * so the archive would hold both rows and both would point at the one Song;
 * joining two weeks on the Song would then return that Entry twice and the
 * week would read as more Entries than the Chart has Positions.
 */
test('a Chart Week naming one Song at two Positions is refused whole', async () => {
  const oneSong = { title: 'LONG WAY DOWN', artist: 'THE WANDERING HEARTS' }
  const twiceOver = records.map((record, index) =>
    index === 8 || index === 41 ? { ...record, ...oneSong } : record,
  )
  const api = apiFor(sourceServing(twiceOver))

  const run = await ingest(api, VERIFIED_WEEK)

  expect(run.status).toBe(502)
  expect(await run.json()).toMatchObject({
    error: 'chart_week_rejected',
    message: expect.stringContaining(
      'LONG WAY DOWN by THE WANDERING HEARTS at two Positions',
    ),
  })
  expect(await heldChartWeek(api)).toBeNull()
})

test('a Chart Week with a Position the Chart does not have is refused whole', async () => {
  // Which is also how a gap is caught: a hundred distinct Positions, none of
  // them above 100, leaves nowhere for a missing Position 63 to hide.
  const gapped = records.map((record, index) =>
    index === 62 ? { ...record, rank: 101 } : record,
  )

  const run = await ingest(apiFor(sourceServing(gapped)), VERIFIED_WEEK)

  expect(run.status).toBe(502)
  expect(await run.json()).toMatchObject({
    error: 'chart_week_rejected',
    message: expect.stringContaining(
      'Position 101, which uk-singles does not have',
    ),
  })
})

test('a Chart Week missing a Song title is refused whole', async () => {
  const untitled = records.map((record, index) =>
    index === 8 ? { ...record, title: '  ' } : record,
  )

  const run = await ingest(apiFor(sourceServing(untitled)), VERIFIED_WEEK)

  expect(run.status).toBe(502)
  expect(await run.json()).toMatchObject({
    error: 'chart_week_rejected',
    message: expect.stringContaining('no Song title at Position 9'),
  })
})

test('a Chart Week missing an Artist is refused whole', async () => {
  const uncredited = records.map((record, index) =>
    index === 8 ? { ...record, artist: null } : record,
  )

  const run = await ingest(apiFor(sourceServing(uncredited)), VERIFIED_WEEK)

  expect(run.status).toBe(502)
  expect(await run.json()).toMatchObject({
    error: 'chart_week_rejected',
    message: expect.stringContaining('no Artist at Position 9'),
  })
})

test('re-fetching a Chart Week already held leaves the archive as it was', async () => {
  const api = apiFor()

  await ingest(api, VERIFIED_WEEK)
  const first = await heldChartWeek(api)

  const again = await ingest(api, { ...VERIFIED_WEEK, refetch: true })

  expect(again.status).toBe(200)
  expect(await heldChartWeek(api)).toEqual(first)
  // The archive is unchanged; the run log still gains a row, because the run
  // is a thing that happened.
  expect(await runsFor(api)).toHaveLength(2)
})

test('an Artist over the Chart Compiler cap is flagged, not rejected', async () => {
  const overCap = records.map((record, index) =>
    index === 70 ? { ...record, artist: 'CHARLI XCX' } : record,
  )

  const api = apiFor(sourceServing(overCap))
  const run = await ingest(api, VERIFIED_WEEK)

  expect(run.status).toBe(200)
  expect(await run.json()).toMatchObject({
    status: 'succeeded',
    entries: 100,
    flags: [{ kind: 'artist_over_cap', artist: 'CHARLI XCX', entries: 4 }],
  })
  // Waveger consumes Charts and never compiles them, so the week is held.
  expect(await heldChartWeek(api)).not.toBeNull()
  // Recorded on the run, not merely answered to whoever triggered it.
  expect(await runsFor(api)).toEqual([
    expect.objectContaining({
      status: 'succeeded',
      flags: [{ kind: 'artist_over_cap', artist: 'CHARLI XCX', entries: 4 }],
    }),
  ])
})

test('a week that breached the cap and was refused still records the breach', async () => {
  // Over the cap and a Position short. OLIVIA RODRIGO rather than CHARLI XCX,
  // whose third Entry is at Position 100 and would be lost to the slice.
  const overCapAndShort = records
    .map((record, index) =>
      index === 70 ? { ...record, artist: 'OLIVIA RODRIGO' } : record,
    )
    .slice(0, 99)

  const api = apiFor(sourceServing(overCapAndShort))
  const run = await ingest(api, VERIFIED_WEEK)

  expect(run.status).toBe(502)
  expect(await heldChartWeek(api)).toBeNull()
  // The week is gone; the run is the only record that the breach was seen.
  expect(await runsFor(api)).toEqual([
    expect.objectContaining({
      status: 'failed',
      flags: [{ kind: 'artist_over_cap', artist: 'OLIVIA RODRIGO', entries: 4 }],
    }),
  ])
})

test('a source that cannot answer records a failed run and holds nothing', async () => {
  const api = apiFor(failingSource().source)

  const run = await ingest(api, VERIFIED_WEEK)

  expect(run.status).toBe(502)
  expect(await run.json()).toMatchObject({
    error: 'chart_source_unavailable',
    message: 'the actor run failed (after 3 attempts)',
  })
  expect(await heldChartWeek(api)).toBeNull()
  expect(await runsFor(api)).toEqual([
    expect.objectContaining({
      status: 'failed',
      failure: 'the actor run failed (after 3 attempts)',
      // Nothing was fetched, so there is nothing to replay.
      payloadStored: false,
    }),
  ])
})

/**
 * A source that fails its first `failures` fetches and then answers with the
 * verified week, keeping what each attempt was told to resume from.
 *
 * The cursor it hands back is invented — `{ received }` rather than anything an
 * actor would recognise — and that is the point. Nothing between a failed fetch
 * and the next one may look inside a `ResumeCursor`, so a fake one carries the
 * retry exactly as far as a real one does.
 */
function failingSource(failures = Number.POSITIVE_INFINITY) {
  const resumedFrom: (ResumeCursor | undefined)[] = []
  let fetches = 0

  const source: ChartSource = {
    async fetchChartWeek(id, resumeFrom) {
      resumedFrom.push(resumeFrom)
      fetches += 1
      if (fetches > failures) return createFixtureChartSource().fetchChartWeek(id)

      throw new ChartSourceError('the actor run failed', {
        resumeFrom: { received: fetches * 40 },
      })
    },
  }

  return { source, resumedFrom }
}

test('a fetch that fails is tried again, and the Chart Week is held', async () => {
  const failsOnce = failingSource(1)
  const api = apiFor(failsOnce.source)

  const run = await ingest(api, VERIFIED_WEEK)

  expect(run.status).toBe(200)
  expect(await run.json()).toMatchObject({ status: 'succeeded', entries: 100 })
  expect(failsOnce.resumedFrom).toHaveLength(2)
  // One run row, not one per attempt: the fetch is what was retried, and the
  // ingestion either happened or did not.
  expect(await runsFor(api)).toEqual([
    expect.objectContaining({ status: 'succeeded' }),
  ])
})

/**
 * The actor charges $0.001 a record and $0.10 to start (ADR 0002), so a retry
 * that began again from Position 1 would pay twice for everything the failed
 * attempt had already received. Resuming is the difference, and this is the
 * assertion that the cursor makes the round trip: out of a failed fetch, past
 * a retry that cannot read it, and into the next fetch untouched.
 */
test('each retry is told where the attempt before it stopped', async () => {
  const failsTwice = failingSource(2)

  await ingest(apiFor(failsTwice.source), VERIFIED_WEEK)

  expect(failsTwice.resumedFrom).toEqual([
    // Nothing has been received yet, so the first attempt starts from scratch.
    undefined,
    { received: 40 },
    { received: 80 },
  ])
})

test('a retry waits, and waits longer the second time', async () => {
  const { policy, waits } = retryPolicy()

  await ingest(apiFor(failingSource().source, policy), VERIFIED_WEEK)

  expect(waits).toEqual([2_000, 4_000])
})

/**
 * The schedule has to survive a week it could not fetch. Exhausted retries
 * record a failed run and answer, rather than raising — a handler that threw
 * would answer 500 from `app.onError`, and Vercel does not retry a cron
 * invocation, so the next attempt is next week's either way.
 */
test('exhausted retries record a failed run rather than raising', async () => {
  const alwaysFails = failingSource()
  const { policy, waits } = retryPolicy(2)
  const api = apiFor(alwaysFails.source, policy)

  const run = await ingest(api, VERIFIED_WEEK)

  expect(run.status).toBe(502)
  expect(await run.json()).toMatchObject({
    error: 'chart_source_unavailable',
    message: 'the actor run failed (after 2 attempts)',
  })
  expect(alwaysFails.resumedFrom).toHaveLength(2)
  expect(waits).toHaveLength(1)
  expect(await heldChartWeek(api)).toBeNull()
  expect(await runsFor(api)).toHaveLength(1)
})

/**
 * A source that is misconfigured rather than unlucky gives the same answer
 * three times, six seconds apart. Worse, the count on the message would make
 * "APIFY_TOKEN is not set" read like a flaky actor and send an operator to the
 * wrong place entirely.
 */
test('a source that says trying again cannot help is not tried again', async () => {
  let fetches = 0
  const misconfigured: ChartSource = {
    fetchChartWeek: () => {
      fetches += 1
      return Promise.reject(
        new ChartSourceError('APIFY_TOKEN is not set', { permanent: true }),
      )
    },
  }
  const { policy, waits } = retryPolicy()
  const api = apiFor(misconfigured, policy)

  const run = await ingest(api, VERIFIED_WEEK)

  expect(run.status).toBe(502)
  expect(await run.json()).toMatchObject({
    error: 'chart_source_unavailable',
    message: 'APIFY_TOKEN is not set',
  })
  expect(fetches).toBe(1)
  expect(waits).toEqual([])
  // Still a run, and still recorded: nothing was held, and the archive owes an
  // explanation for that whether the cause was the actor or the deployment.
  expect(await runsFor(api)).toEqual([
    expect.objectContaining({
      status: 'failed',
      failure: 'APIFY_TOKEN is not set',
    }),
  ])
})

/**
 * A week the source answered and the archive refused is not retried. There is
 * nothing to resume — the run finished — so a second attempt would pay the
 * actor in full to be told the same thing.
 */
test('a Chart Week the archive refuses is not fetched again', async () => {
  let fetches = 0
  const short = createFixtureChartSource({
    'uk-singles/2026-07-31': records.slice(0, 99),
  })
  const counted: ChartSource = {
    fetchChartWeek: (id, resumeFrom) => {
      fetches += 1
      return short.fetchChartWeek(id, resumeFrom)
    },
  }

  const run = await ingest(apiFor(counted), VERIFIED_WEEK)

  expect(run.status).toBe(502)
  expect(fetches).toBe(1)
})

/**
 * A source that fails the moment it is asked, so that "did not call the
 * `ChartSource` at all" is an assertion rather than a hope. Its message is what
 * a 502 would carry if the short-circuit ever stopped working.
 */
const neverAsked: ChartSource = {
  fetchChartWeek: () =>
    Promise.reject(
      new ChartSourceError('a Chart Week that is Held was fetched again'),
    ),
}

test('a Chart Week already Held is not fetched again', async () => {
  const api = apiFor()
  await ingest(api, VERIFIED_WEEK)

  const again = await ingest(apiFor(neverAsked), VERIFIED_WEEK)

  expect(again.status).toBe(200)
  expect(await again.json()).toEqual({
    status: 'already_held',
    chart: 'uk-singles',
    date: '2026-07-31',
    entries: 100,
  })
  // Nothing ran, so there is no run to record. The archive is the answer to
  // why: the week is Held, and the run that held it is still in the log.
  expect(await runsFor(api)).toHaveLength(1)
})

/**
 * Held says the Chart Week and its Entries are in the archive. It deliberately
 * does not mean "a run happened for this week" — a week that has only ever been
 * refused has runs and no Entries, and if a run row were enough to stop the
 * next fetch, that hole could never be filled and would be permanent.
 */
test('a Chart Week that has only ever failed is not Held', async () => {
  const api = apiFor(sourceServing(records.slice(0, 99)))
  await ingest(api, VERIFIED_WEEK)
  expect(await runsFor(api)).toHaveLength(1)

  const repaired = await ingest(apiFor(), VERIFIED_WEEK)

  expect(repaired.status).toBe(200)
  expect(await repaired.json()).toMatchObject({ status: 'succeeded' })
  expect(await heldChartWeek(api)).not.toBeNull()
})

/**
 * A Chart Week can be Held and wrong, so there has to be a way to fetch one
 * again — and it has to be asked for, because the schedule runs weekly and
 * would otherwise pay the actor for every week it already has.
 */
test('the operator can override the skip and re-fetch a Held Chart Week', async () => {
  const api = apiFor()
  await ingest(api, VERIFIED_WEEK)
  const corrected = records.map((record, index) =>
    index === 99 ? { ...record, weeks_on_chart: 2 } : record,
  )

  const again = await ingest(apiFor(sourceServing(corrected)), {
    ...VERIFIED_WEEK,
    refetch: true,
  })

  expect(again.status).toBe(200)
  expect(await again.json()).toMatchObject({ status: 'succeeded' })
  const week = await heldChartWeek(api)
  expect(week?.entries.at(-1)).toMatchObject({ position: 100, weeksOnChart: 2 })
})

test('a Chart Waveger does not have is refused', async () => {
  const api = apiFor()

  const run = await ingest(api, { chart: 'uk-albums', date: '2026-07-31' })

  expect(run.status).toBe(404)
  expect(await run.json()).toMatchObject({ error: 'not_found' })
})

test('a request that does not name a Chart Week is refused', async () => {
  const api = apiFor()

  const run = await ingest(api, { chart: 'uk-singles', date: '31-07-2026' })

  expect(run.status).toBe(422)
  expect(await run.json()).toMatchObject({ error: 'invalid_request' })
})
