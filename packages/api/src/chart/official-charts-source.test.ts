import { createTestDatabase, type TestDatabase } from '@waveger/db/testing'
import { chartWeekSchema } from '@waveger/domain'
import { afterEach, beforeEach, expect, test } from 'vitest'
import { createApi } from '../app'
import { toSourceEntry as toActorEntry } from './actor-record'
import { chartAddresses } from './archive'
import apifyVerifiedRun from './fixtures/apify/uk-singles-2026-07-31.json'
import previousWeek from './fixtures/official-charts/uk-singles-2026-07-24.json'
import unpublishedDate from './fixtures/official-charts/uk-singles-2026-07-29-unpublished.json'
import verifiedWeek from './fixtures/official-charts/uk-singles-2026-07-31.json'
import {
  createOfficialChartsSource,
  type FetchLike,
} from './official-charts-source'
import { exponentialBackoffMs, type RetryPolicy } from './retry'
import { ChartSourceError } from './source'

/**
 * The adapter ADR 0017 moves Waveger onto, driven against real captured
 * responses.
 *
 * Everything under `fixtures/official-charts/` came off
 * `backstage.officialcharts.com/ce-api` verbatim, whole and unedited, page
 * furniture and all:
 *
 *     curl https://backstage.officialcharts.com/ce-api/charts/singles-chart/20260731/7501/
 *
 * Verbatim because a hand-authored Chart Week has already misled in this repo:
 * the invented predecessor week WAV-11 replaced reproduced the aggregate shape
 * of a real one exactly — 37 climbs, 41 falls, 11 debuts at the right Positions
 * — while getting the biggest fall of the week and all eleven exits wrong.
 *
 * The adapter takes its `fetch`, so these tests drive the real one: the path it
 * builds, the response it reads, the failures it turns into errors. There is no
 * stand-in implementation of any of it to drift from what a deployment runs.
 */

let database: TestDatabase

const OPERATOR_SECRET = 'test-operator-secret'

const VERIFIED_WEEK = { chart: 'uk-singles', date: '2026-07-31' }

const SINGLES_CHART_URL =
  'https://backstage.officialcharts.com/ce-api/charts/singles-chart/20260731/7501/'

/**
 * A `fetch` serving captured responses by URL, and recording what was asked
 * for.
 *
 * A `Response` is served as it is, for the failures the Compiler answers with
 * something that is not a page; anything else is served as JSON. A URL the test
 * did not set up answers 404, which is a failure to have written the test
 * rather than a case being exercised.
 */
function serving(responses: Readonly<Record<string, unknown>>) {
  const requested: string[] = []

  const fetch: FetchLike = (url) => {
    requested.push(url)
    const body = responses[url]

    if (body instanceof Response) return Promise.resolve(body)

    return Promise.resolve(
      body === undefined
        ? new Response('not set up by this test', { status: 404 })
        : Response.json(body),
    )
  }

  return { fetch, requested }
}

/** What the Compiler actually answers a chart id it does not have. */
const serverError = () =>
  new Response(
    'The website encountered an unexpected error. Please try again later.<br />',
    { status: 500, headers: { 'content-type': 'text/html; charset=UTF-8' } },
  )

/** The adapter as a deployment builds it, but reading captured responses. */
const sourceServing = (responses: Readonly<Record<string, unknown>>) => {
  const { fetch, requested } = serving(responses)

  return {
    requested,
    source: createOfficialChartsSource({
      chartAddress: chartAddresses(database.db),
      fetch,
    }),
  }
}

const verifiedWeekOnly = { [SINGLES_CHART_URL]: verifiedWeek }

const noWaiting: RetryPolicy = {
  attempts: 1,
  backoffMs: exponentialBackoffMs,
  sleep: () => Promise.resolve(),
}

const apiFor = (responses: Readonly<Record<string, unknown>>) =>
  createApi({
    db: database.db,
    chartSource: sourceServing(responses).source,
    operatorSecret: OPERATOR_SECRET,
    ingestionRetry: noWaiting,
  })

const ingest = (api: ReturnType<typeof createApi>, date: string) =>
  api.request('/api/internal/ingest', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${OPERATOR_SECRET}`,
    },
    body: JSON.stringify({ chart: 'uk-singles', date }),
  })

const heldChartWeek = async (api: ReturnType<typeof createApi>) => {
  const response = await api.request('/api/v1/chart-weeks/latest')
  return response.status === 404
    ? null
    : chartWeekSchema.parse(await response.json())
}

const runsFor = async (api: ReturnType<typeof createApi>, date: string) => {
  const response = await api.request(
    `/api/internal/runs?chart=uk-singles&date=${date}`,
    { headers: { authorization: `Bearer ${OPERATOR_SECRET}` } },
  )
  const body = (await response.json()) as { runs: unknown[] }
  return body.runs
}

beforeEach(async () => {
  database = await createTestDatabase()
})

afterEach(async () => {
  await database.dispose()
})

/**
 * The Chart's address is read from the Chart, not written down per request.
 *
 * Proved by moving it. A Chart addressed somewhere else is fetched from
 * somewhere else, with nothing in the adapter edited — which is what makes a
 * second Chart a migration seeding two columns.
 */
test("the request is addressed from the Chart's own row", async () => {
  const { source, requested } = sourceServing(verifiedWeekOnly)

  await source.fetchChartWeek(VERIFIED_WEEK)
  expect(requested).toEqual([SINGLES_CHART_URL])

  await database.db
    .updateTable('chart')
    .set({ compiler_slug: 'dance-singles-chart', compiler_chart_id: 104 })
    .where('slug', '=', 'uk-singles')
    .execute()

  await source.fetchChartWeek(VERIFIED_WEEK).catch(() => undefined)

  expect(requested.at(-1)).toBe(
    'https://backstage.officialcharts.com/ce-api/charts/dance-singles-chart/20260731/104/',
  )
})

/**
 * The Chart Week comes out of the Compiler's page the same way it came out of
 * the actor's records, Position for Position.
 *
 * The two payloads share nothing — one is a flat list of scraped rows, the
 * other a rendered page with a chart list somewhere inside it — so this is the
 * whole claim of ADR 0017 in one assertion: the source changed and the Chart
 * Week did not.
 */
test('the verified Chart Week reads exactly as the actor reported it', async () => {
  const { source } = sourceServing(verifiedWeekOnly)

  const week = await source.fetchChartWeek(VERIFIED_WEEK)

  expect(week.entries).toEqual(
    (apifyVerifiedRun as unknown[]).map(toActorEntry),
  )
  expect(week.entries).toHaveLength(100)
})

/** Untouched, as received: the run stores the page, not this file's reading of it. */
test('the payload kept is the response as it arrived', async () => {
  const { source } = sourceServing(verifiedWeekOnly)

  const week = await source.fetchChartWeek(VERIFIED_WEEK)

  expect(week.payload).toEqual(verifiedWeek)
})

/**
 * A whole Chart Week arrives in one response, so there is no half-finished
 * fetch to resume — and the seam already lets a source ignore the cursor and
 * start again.
 */
test('the resume cursor is ignored', async () => {
  const { source, requested } = sourceServing(verifiedWeekOnly)

  const resumed = await source.fetchChartWeek(VERIFIED_WEEK, {
    cursor: 'from an adapter that is not this one',
  })

  expect(resumed.entries).toHaveLength(100)
  expect(requested).toEqual([SINGLES_CHART_URL])
})

/**
 * A date the Compiler does not publish is answered with a redirect to one it
 * does. Zero Entries is the right reading of that: it is an answer, and it is
 * not a Chart Week, so it is refused as a week rather than raised as a fetch
 * that failed.
 */
test('a date the Chart Compiler does not publish has no Entries', async () => {
  const { source } = sourceServing({
    'https://backstage.officialcharts.com/ce-api/charts/singles-chart/20260729/7501/':
      unpublishedDate,
  })

  const week = await source.fetchChartWeek({
    chart: 'uk-singles',
    date: '2026-07-29',
  })

  expect(week.entries).toEqual([])
  expect(week.payload).toEqual(unpublishedDate)
})

/**
 * The other shape of date-snapping, refused rather than parsed.
 *
 * Today the Compiler redirects a date it does not publish and the redirect
 * carries no chart list, so the case above covers it. This is what happens if
 * it ever answers with the page instead: real Entries for a week nobody asked
 * for, which must never reach the archive under the date that was asked for.
 */
test('a page answering for another Chart Week is not an answer', async () => {
  const { source } = sourceServing({
    'https://backstage.officialcharts.com/ce-api/charts/singles-chart/20260729/7501/':
      previousWeek,
  })

  const snapped = source.fetchChartWeek({
    chart: 'uk-singles',
    date: '2026-07-29',
  })

  await expect(snapped).rejects.toThrow(/Chart Week of 2026-07-24/)
})

/**
 * A chart id the Compiler does not have answers 500 with an HTML error page —
 * measured, and not what ADR 0017 predicts, which is why the status is checked
 * before anything reads the body as JSON. Read as JSON first it would be a
 * `SyntaxError` about an unexpected `T`, which says nothing about the Chart.
 */
test('a Compiler that answers with an error page is a fetch that failed', async () => {
  const { source } = sourceServing({ [SINGLES_CHART_URL]: serverError() })

  const errored = source.fetchChartWeek(VERIFIED_WEEK)

  await expect(errored).rejects.toBeInstanceOf(ChartSourceError)
  await expect(errored).rejects.toThrow(
    /the Chart Compiler answered 500 for uk-singles 2026-07-31/,
  )
})

/** A 200 that is not JSON at all, which no reading of the payload survives. */
test('a Compiler that answers with something that is not JSON is a fetch that failed', async () => {
  const { source } = sourceServing({
    [SINGLES_CHART_URL]: new Response('<!doctype html><html></html>', {
      status: 200,
      headers: { 'content-type': 'text/html' },
    }),
  })

  const unreadable = source.fetchChartWeek(VERIFIED_WEEK)

  await expect(unreadable).rejects.toThrow(/something that is not JSON/)
})

/** No amount of waiting gives a deployment a Chart its archive does not have. */
test('a Chart with no address cannot be fetched, and says so once', async () => {
  const { source, requested } = sourceServing(verifiedWeekOnly)

  const unknown = source.fetchChartWeek({ chart: 'uk-albums', date: '2026-07-31' })

  await expect(unknown).rejects.toMatchObject({ permanent: true })
  await expect(unknown).rejects.toBeInstanceOf(ChartSourceError)
  expect(requested).toEqual([])
})

/**
 * The whole point, end to end: the archive a visitor reads is the one it
 * already held.
 */
test('ingesting the verified Chart Week through the Compiler holds the same week', async () => {
  const api = apiFor(verifiedWeekOnly)

  const run = await ingest(api, '2026-07-31')

  expect(run.status).toBe(200)
  expect(await run.json()).toMatchObject({
    status: 'succeeded',
    chart: 'uk-singles',
    date: '2026-07-31',
    entries: 100,
  })

  const week = await heldChartWeek(api)
  expect(week?.entries).toHaveLength(100)
  expect(week?.entries[0]).toMatchObject({
    position: 1,
    title: 'REIN ME IN',
    artist: 'SAM FENDER & OLIVIA DEAN',
    peakPosition: 1,
    weeksOnChart: 59,
  })
})

/**
 * `lastWeek` is complete on this source where the actor left it null on every
 * descending Entry — and it is still not read.
 *
 * Movement is derived by self-joining Waveger's own archive one Chart Week
 * back, which is what makes correcting a past week fix its neighbours
 * (ADR 0012). Read off the payload instead, this week would report movement
 * for the 89 Entries that carry a `lastWeek`; held alone, every one of them is
 * `unknown`, because Waveger has no predecessor to have moved from.
 */
test('Movement is derived from the archive and never read off the payload', async () => {
  const api = apiFor({
    [SINGLES_CHART_URL]: verifiedWeek,
    'https://backstage.officialcharts.com/ce-api/charts/singles-chart/20260724/7501/':
      previousWeek,
  })

  await ingest(api, '2026-07-31')

  const alone = await heldChartWeek(api)
  expect(alone?.entries.map((entry) => entry.movement.kind)).toEqual(
    Array.from({ length: 100 }, () => 'unknown'),
  )

  await ingest(api, '2026-07-24')

  const withPredecessor = await heldChartWeek(api)
  expect(withPredecessor?.date).toBe('2026-07-31')
  expect(withPredecessor?.entries[0]?.movement).toEqual({ kind: 'non-mover' })
  expect(
    withPredecessor?.entries.filter(
      (entry) => entry.movement.kind === 'unknown',
    ),
  ).toEqual([])
})

/**
 * A week that was not published leaves the archive exactly as it was, and an
 * explanation of why.
 */
test('a Chart Week the Compiler does not publish is refused, and nothing is stored', async () => {
  const api = apiFor({
    'https://backstage.officialcharts.com/ce-api/charts/singles-chart/20260729/7501/':
      unpublishedDate,
  })

  const run = await ingest(api, '2026-07-29')

  // Refused rather than unanswered, and the two are the same 502 with
  // different bodies: this one says the Compiler replied and what it replied
  // with was not a Chart Week.
  expect(run.status).toBe(502)
  expect(await run.json()).toEqual({
    error: 'chart_week_rejected',
    message:
      'uk-singles 2026-07-29 has 0 Entries; uk-singles has 100 Positions, ' +
      'so none of it was held.',
  })

  expect(await runsFor(api, '2026-07-29')).toEqual([
    expect.objectContaining({ status: 'rejected', payloadStored: true }),
  ])
  expect(await heldChartWeek(api)).toBeNull()
  expect(
    await database.db.selectFrom('chart_week').selectAll().execute(),
  ).toEqual([])
})

/**
 * Which source answered, on the run.
 *
 * Which adapter a deployment is wired to is a deploy-time fact that leaves no
 * other trace, so this is the only thing that tells a week fetched during a
 * fallback from every other week afterwards.
 */
test('the run records which source answered', async () => {
  const api = apiFor(verifiedWeekOnly)

  await ingest(api, '2026-07-31')
  await ingest(api, '2026-07-29')

  expect(await runsFor(api, '2026-07-31')).toEqual([
    expect.objectContaining({ status: 'succeeded', source: 'official-charts' }),
  ])
  expect(await runsFor(api, '2026-07-29')).toEqual([
    expect.objectContaining({ status: 'unavailable', source: 'official-charts' }),
  ])
})
