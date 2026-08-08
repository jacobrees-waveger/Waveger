import { createTestDatabase, type TestDatabase } from '@waveger/db/testing'
import { afterEach, beforeEach, expect, test } from 'vitest'
import { createApi } from '../app'
import verifiedRun from '../chart/fixtures/apify/uk-singles-2026-07-31.json'
import { createFixtureChartSource, type StoredRuns } from '../chart/fixture-source'
import { exponentialBackoffMs, type RetryPolicy } from '../chart/retry'
import { ChartSourceError, type ChartSource } from '../chart/source'

/**
 * The ingestion run history, across Chart Weeks rather than within one.
 *
 * `archive.test.ts` asks whether there is a hole; this asks what happened at
 * one. A Chart Week Waveger does not hold needs an explanation, and after
 * WAV-17 the explanation has to be findable without already knowing which week
 * to ask about.
 */

let database: TestDatabase

const OPERATOR_SECRET = 'test-operator-secret'

const records = verifiedRun as readonly Record<string, unknown>[]

const WEEKS = ['2026-07-17', '2026-07-24', '2026-07-31'] as const

/** The verified run under each of these Chart Weeks, and no other. */
const sourceServing = (dates: readonly string[], run: readonly unknown[] = records) =>
  createFixtureChartSource(
    Object.fromEntries(
      dates.map((date) => [`uk-singles/${date}`, run]),
    ) as StoredRuns,
  )

const noWaiting: RetryPolicy = {
  attempts: 1,
  backoffMs: exponentialBackoffMs,
  sleep: () => Promise.resolve(),
}

const apiFor = (source: ChartSource) =>
  createApi({
    db: database.db,
    chartSource: source,
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

interface HistoricRun {
  chart: string
  date: string
  status: string
  failure: string | null
  flags: { kind: string; artist: string; entries: number }[]
  payloadStored: boolean
  ranAt: string
}

const historyOf = async (
  api: ReturnType<typeof createApi>,
  query = 'chart=uk-singles',
) => {
  const response = await api.request(`/api/internal/runs?${query}`, {
    headers: { authorization: `Bearer ${OPERATOR_SECRET}` },
  })
  expect(response.status).toBe(200)
  const body = (await response.json()) as { runs: HistoricRun[] }
  return body.runs
}

beforeEach(async () => {
  database = await createTestDatabase()
})

afterEach(async () => {
  await database.dispose()
})

test('the history covers every Chart Week and names the one each run targeted', async () => {
  const api = apiFor(sourceServing(WEEKS))

  for (const week of WEEKS) await ingest(api, week)

  const runs = await historyOf(api)

  // Most recent first, which is when each ran and not which week it was for.
  expect(runs.map((run) => run.date)).toEqual([...WEEKS].reverse())
  expect(runs.every((run) => run.chart === 'uk-singles')).toBe(true)

  const ranAt = runs.map((run) => Date.parse(run.ranAt))
  expect(ranAt.every(Number.isFinite)).toBe(true)
  expect([...ranAt].sort((first, second) => second - first)).toEqual(ranAt)
})

/**
 * The two ways a run fails send an operator to different places: a source that
 * answered with something that is not a Chart Week is a parsing or a Compiler
 * problem, and a source that never answered is Apify or the token. Before
 * WAV-17 both were `failed` and the difference lived in the prose.
 */
test('a run that was refused and a run nobody answered are different outcomes', async () => {
  const refused = apiFor(sourceServing(['2026-07-24'], records.slice(0, 99)))
  const silent = apiFor({
    name: 'fixture',
    fetchChartWeek: () => Promise.reject(new ChartSourceError('the actor run failed')),
  })

  await ingest(refused, '2026-07-24')
  await ingest(silent, '2026-07-31')

  expect(await historyOf(refused)).toEqual([
    expect.objectContaining({
      date: '2026-07-31',
      status: 'unavailable',
      failure: 'the actor run failed (after 1 attempt)',
      // Nothing arrived, so there is nothing to replay.
      payloadStored: false,
    }),
    expect.objectContaining({
      date: '2026-07-24',
      status: 'rejected',
      failure: expect.stringContaining('has 99 Entries; uk-singles has 100'),
      // Kept: the week can be replayed against changed parsing for free.
      payloadStored: true,
    }),
  ])
})

/**
 * The Chart Compiler caps an Artist at three Songs in the Top 100. A breach is
 * evidence the source is wrong, never something for Waveger to correct, so it
 * rides on the run and the week is still held.
 */
test('a Chart Week over the three-per-Artist cap is flagged on its run', async () => {
  const overCap = records.map((record, index) =>
    index === 70 ? { ...record, artist: 'CHARLI XCX' } : record,
  )
  const api = apiFor(sourceServing(['2026-07-31'], overCap))

  await ingest(api, '2026-07-31')

  expect(await historyOf(api)).toEqual([
    expect.objectContaining({
      date: '2026-07-31',
      status: 'succeeded',
      flags: [{ kind: 'artist_over_cap', artist: 'CHARLI XCX', entries: 4 }],
    }),
  ])
})

test('naming a Chart Week narrows the history to that week', async () => {
  const api = apiFor(sourceServing(WEEKS))

  for (const week of WEEKS) await ingest(api, week)

  const runs = await historyOf(api, 'chart=uk-singles&date=2026-07-24')

  expect(runs.map((run) => run.date)).toEqual(['2026-07-24'])
})

/**
 * The history is unbounded — the backfill alone puts thousands of Chart Weeks
 * behind it — so it is capped, and the cap is sayable rather than fixed.
 */
test('the history is capped, most recent kept', async () => {
  const api = apiFor(sourceServing(WEEKS))

  for (const week of WEEKS) await ingest(api, week)

  const runs = await historyOf(api, 'chart=uk-singles&limit=2')

  expect(runs.map((run) => run.date)).toEqual(['2026-07-31', '2026-07-24'])
})

test('a Chart Waveger does not have has no history to report', async () => {
  const response = await apiFor(sourceServing([])).request(
    '/api/internal/runs?chart=uk-albums',
    { headers: { authorization: `Bearer ${OPERATOR_SECRET}` } },
  )

  expect(response.status).toBe(404)
  expect(await response.json()).toMatchObject({ error: 'not_found' })
})

test('a request naming no Chart is refused', async () => {
  const response = await apiFor(sourceServing([])).request(
    '/api/internal/runs?date=2026-07-31',
    { headers: { authorization: `Bearer ${OPERATOR_SECRET}` } },
  )

  expect(response.status).toBe(422)
  expect(await response.json()).toMatchObject({ error: 'invalid_request' })
})
