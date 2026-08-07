import { createTestDatabase, type TestDatabase } from '@waveger/db/testing'
import { chartWeekSchema } from '@waveger/domain'
import { afterEach, beforeEach, expect, test } from 'vitest'
import { createApi } from '../app'
import verifiedRun from '../chart/fixtures/uk-singles-2026-07-31.json'
import { createFixtureChartSource } from '../chart/fixture-source'
import { ChartSourceError, type ChartSource } from '../chart/source'

/**
 * Ingestion, driven through its route against a real Postgres, with the
 * fixture `ChartSource` injected. Nothing else is substituted: the archive
 * these tests assert on is the one a visitor reads.
 */

let database: TestDatabase

const apiFor = (source = createFixtureChartSource()) =>
  createApi({ db: database.db, chartSource: source })

const ingest = (api: ReturnType<typeof createApi>, body: unknown) =>
  api.request('/api/internal/ingest', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
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
  expect(week.entries[0]).toEqual({
    position: 1,
    title: 'REIN ME IN',
    artist: 'SAM FENDER & OLIVIA DEAN',
    peakPosition: 1,
    weeksOnChart: 59,
  })
  expect(week.entries.at(-1)).toEqual({
    position: 100,
    title: '2007',
    artist: 'CHARLI XCX',
    peakPosition: 100,
    weeksOnChart: 1,
  })
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

test('re-ingesting a Chart Week already held leaves the archive as it was', async () => {
  const api = apiFor()

  await ingest(api, VERIFIED_WEEK)
  const first = await heldChartWeek(api)

  const again = await ingest(api, VERIFIED_WEEK)

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
  const refusing: ChartSource = {
    fetchChartWeek: () =>
      Promise.reject(new ChartSourceError('the actor run failed')),
  }
  const api = apiFor(refusing)

  const run = await ingest(api, VERIFIED_WEEK)

  expect(run.status).toBe(502)
  expect(await run.json()).toMatchObject({
    error: 'chart_source_unavailable',
    message: 'the actor run failed',
  })
  expect(await heldChartWeek(api)).toBeNull()
  expect(await runsFor(api)).toEqual([
    expect.objectContaining({
      status: 'failed',
      failure: 'the actor run failed',
      // Nothing was fetched, so there is nothing to replay.
      payloadStored: false,
    }),
  ])
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
