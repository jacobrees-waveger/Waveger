import { createTestDatabase, type TestDatabase } from '@waveger/db/testing'
import { chartWeekSchema } from '@waveger/domain'
import { afterEach, beforeEach, expect, test } from 'vitest'
import { createApi } from '../app'
import verifiedRun from '../chart/fixtures/uk-singles-2026-07-31.json'
import { createFixtureChartSource } from '../chart/fixture-source'
import { exponentialBackoffMs, type RetryPolicy } from '../chart/retry'
import { chartWeekDueOn } from '../chart/schedule'
import { ChartSourceError, type ChartSource } from '../chart/source'

/**
 * Ingestion without anybody triggering it.
 *
 * Vercel Cron invokes a path with a GET and nothing else — no body, no method
 * of its own, no way to carry a date (ADR 0013) — so the schedule is a GET
 * naming a Chart, and the week it fetches is the one due now. These tests fire
 * it exactly as the cron entry does, secret included.
 */

let database: TestDatabase

const OPERATOR_SECRET = 'test-operator-secret'

/** The Chart Week the schedule owes today. `chart/schedule.test.ts` has why. */
const DUE = chartWeekDueOn(new Date())

const records = verifiedRun as readonly Record<string, unknown>[]

/** The verified run, filed under whichever Chart Week is due when this runs. */
const dueWeek = () => createFixtureChartSource({ [`uk-singles/${DUE}`]: records })

const noWaiting: RetryPolicy = {
  attempts: 3,
  backoffMs: exponentialBackoffMs,
  sleep: () => Promise.resolve(),
}

const apiFor = (source: ChartSource = dueWeek()) =>
  createApi({
    db: database.db,
    chartSource: source,
    operatorSecret: OPERATOR_SECRET,
    ingestionRetry: noWaiting,
  })

/** Exactly what Vercel Cron sends: a GET, with the secret it sets itself. */
const fire = (api: ReturnType<typeof createApi>, chart = 'uk-singles') =>
  api.request(`/api/internal/ingest/${chart}`, {
    headers: { authorization: `Bearer ${OPERATOR_SECRET}` },
  })

beforeEach(async () => {
  database = await createTestDatabase()
})

afterEach(async () => {
  await database.dispose()
})

test('the schedule ingests the Chart Week due now, naming no date', async () => {
  const api = apiFor()

  const run = await fire(api)

  expect(run.status).toBe(200)
  expect(await run.json()).toMatchObject({
    status: 'succeeded',
    chart: 'uk-singles',
    date: DUE,
    entries: 100,
  })

  const week = chartWeekSchema.parse(
    await (await api.request('/api/v1/chart-weeks/latest')).json(),
  )
  expect(week.date).toBe(DUE)
})

/**
 * Vercel says cron delivery is best effort and can invoke the same scheduled
 * run more than once, so a second firing has to be free rather than a second
 * $0.20 against an account capped at $5 a month (ADR 0002).
 */
test('a schedule that fires twice does not fetch the week twice', async () => {
  await fire(apiFor())

  const again = await fire(
    apiFor({
      fetchChartWeek: () =>
        Promise.reject(new ChartSourceError('the schedule fetched twice')),
    }),
  )

  expect(again.status).toBe(200)
  expect(await again.json()).toMatchObject({ status: 'already_held' })
})

/**
 * A week the actor could not give up is recorded and answered for, not thrown.
 * Vercel does not retry a cron invocation, so the alternative to answering is
 * a 500 in a log nobody is reading.
 */
test('a schedule that cannot fetch its week records a failed run', async () => {
  const api = apiFor({
    fetchChartWeek: () => Promise.reject(new ChartSourceError('no such week')),
  })

  const run = await fire(api)

  expect(run.status).toBe(502)
  expect(await run.json()).toMatchObject({ error: 'chart_source_unavailable' })

  const log = await api.request(
    `/api/internal/runs?chart=uk-singles&date=${DUE}`,
    { headers: { authorization: `Bearer ${OPERATOR_SECRET}` } },
  )
  expect(await log.json()).toMatchObject({
    runs: [{ status: 'failed', failure: 'no such week (after 3 attempts)' }],
  })
})

/**
 * The guard covers the operator namespace and not a list of routes, which is
 * the whole reason it is registered ahead of them (ADR 0011). A scheduled route
 * that answered without the secret would be an unauthenticated way to spend the
 * Apify budget, on a path a cron entry publishes in `vercel.json`.
 */
test('the schedule is behind the shared secret like everything else', async () => {
  const response = await apiFor().request('/api/internal/ingest/uk-singles')

  expect(response.status).toBe(401)
  expect(await response.json()).toMatchObject({ error: 'unauthorised' })
})

test('a schedule naming a Chart Waveger does not have is refused', async () => {
  const response = await fire(apiFor(), 'uk-albums')

  expect(response.status).toBe(404)
  expect(await response.json()).toMatchObject({ error: 'not_found' })
})
