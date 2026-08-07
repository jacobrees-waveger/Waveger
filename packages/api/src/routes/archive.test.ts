import { createTestDatabase, type TestDatabase } from '@waveger/db/testing'
import { afterEach, beforeEach, expect, test } from 'vitest'
import { createApi } from '../app'
import { previousChartWeekDate } from '../chart/cadence'
import verifiedRun from '../chart/fixtures/uk-singles-2026-07-31.json'
import { createFixtureChartSource, type StoredRuns } from '../chart/fixture-source'
import { exponentialBackoffMs, type RetryPolicy } from '../chart/retry'
import { chartWeekDueOn } from '../chart/schedule'

/**
 * Whether the archive is whole, read the way an operator reads it.
 *
 * ADR 0002 puts the actor at a 19% failure rate and the archive cannot be
 * bought back later, so the question these tests are about is not "did this run
 * work" but "is there a hole, and has it been there long". Everything goes
 * through `app.request()`: a Chart Week is Missing only if the route says so.
 */

let database: TestDatabase

const OPERATOR_SECRET = 'test-operator-secret'

/**
 * Dates are counted back from the Chart Week due now rather than written down.
 *
 * The Span reaches forward to the week the schedule owes today, so a fixture
 * dated 2026-07-31 would read as one Held week and a growing pile of Missing
 * ones the further past that date the suite is run. `schedule.test.ts` pins
 * what "due now" means; these tests take it as given, as the schedule does.
 */
const DUE = chartWeekDueOn(new Date())
const weeksBeforeDue = (weeks: number): string =>
  Array.from({ length: weeks }).reduce<string>(previousChartWeekDate, DUE)

const records = verifiedRun as readonly Record<string, unknown>[]

/** The verified run, served for each of these Chart Weeks and no other. */
const sourceServing = (dates: readonly string[], run = records) =>
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

const apiFor = (dates: readonly string[] = [], run = records) =>
  createApi({
    db: database.db,
    chartSource: sourceServing(dates, run),
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

interface ArchiveHealth {
  chart: string
  span: { from: string; to: string } | null
  held: string[]
  missing: string[]
}

const healthOf = async (
  api: ReturnType<typeof createApi>,
  chart = 'uk-singles',
) => {
  const response = await api.request(`/api/internal/archive?chart=${chart}`, {
    headers: { authorization: `Bearer ${OPERATOR_SECRET}` },
  })
  expect(response.status).toBe(200)
  return (await response.json()) as ArchiveHealth
}

beforeEach(async () => {
  database = await createTestDatabase()
})

afterEach(async () => {
  await database.dispose()
})

/**
 * An archive holding nothing is new, not broken. There is no Span for a hole to
 * be in, so nothing is Missing — the alternative reports every week since 1952
 * as Missing on a first deployment.
 */
test('an archive holding no Chart Week has no Span and nothing Missing', async () => {
  expect(await healthOf(apiFor())).toEqual({
    chart: 'uk-singles',
    span: null,
    held: [],
    missing: [],
  })
})

/**
 * The ticket's own acceptance criterion, and the reason the route exists: a
 * Chart Week absent from the middle of the cadence is a hole, and ADR 0012 puts
 * its cost at two weeks of movement rather than one.
 */
test('a Chart Week absent from the middle of the cadence is Missing', async () => {
  const [twoBack, oneBack] = [weeksBeforeDue(2), weeksBeforeDue(1)]
  const api = apiFor([twoBack, DUE])

  await ingest(api, twoBack)
  await ingest(api, DUE)

  expect(await healthOf(api)).toEqual({
    chart: 'uk-singles',
    span: { from: twoBack, to: DUE },
    held: [twoBack, DUE],
    missing: [oneBack],
  })
})

/**
 * The failure this route is really for. A schedule that has stopped leaves no
 * hole between two Held weeks — it leaves the archive short at the end, which
 * is invisible to anything that only looks between the weeks it has.
 */
test('the weeks a stopped schedule owes are Missing, not merely absent', async () => {
  const start = weeksBeforeDue(3)
  const api = apiFor([start])

  await ingest(api, start)

  expect(await healthOf(api)).toMatchObject({
    span: { from: start, to: DUE },
    held: [start],
    missing: [weeksBeforeDue(2), weeksBeforeDue(1), DUE],
  })
})

/**
 * The other half of the distinction `CONTEXT.md` names. A week nothing ever
 * reached for was never claimed, so it is outside the Span rather than Missing
 * — otherwise a first ingestion reports every week back to 1952.
 */
test('a Chart Week the archive never reached for is outside the Span, not Missing', async () => {
  const api = apiFor([DUE])

  await ingest(api, DUE)

  const health = await healthOf(api)
  expect(health.span).toEqual({ from: DUE, to: DUE })
  expect(health.missing).toEqual([])
  expect(health.held).toEqual([DUE])
})

/**
 * The Span starts at the earliest week *reached for*, not the earliest one
 * Held, and this is why. Started at the earliest Held week, it would begin
 * after the loss and pronounce the archive clean — the hole at the old end of
 * the archive being exactly the one nobody would ever go looking for.
 */
test('a Chart Week lost at the start of the archive is still Missing', async () => {
  const [twoBack, oneBack] = [weeksBeforeDue(2), weeksBeforeDue(1)]
  const api = apiFor([oneBack, DUE])
  const halfScraped = apiFor([twoBack], records.slice(0, 99))

  await ingest(halfScraped, twoBack)
  await ingest(api, oneBack)
  await ingest(api, DUE)

  expect(await healthOf(api)).toMatchObject({
    span: { from: twoBack, to: DUE },
    held: [oneBack, DUE],
    missing: [twoBack],
  })
})

/**
 * The launch-day version of the same failure, and the worst reading of it: an
 * archive whose every run has failed holds nothing, and "holds nothing" is what
 * a brand new archive looks like too. ADR 0002 puts the actor at one failure in
 * five, so this is a plausible first week rather than a contrived one.
 */
test('an archive whose every run failed is not mistaken for a new one', async () => {
  const failing = apiFor([])

  await ingest(failing, DUE)

  expect(await healthOf(failing)).toEqual({
    chart: 'uk-singles',
    span: { from: DUE, to: DUE },
    held: [],
    missing: [DUE],
  })
})

/**
 * Held means the Chart Week and every Entry on it (`CONTEXT.md`). A week the
 * source answered for and the archive refused has a run and no Entries, and the
 * whole point of this report is that such a week reads as a hole rather than as
 * something that was dealt with.
 *
 * The two halves of WAV-17 meet here: the hole is what `GET /archive` is for,
 * and the reason it is there is what `GET /runs` is for. A Missing Chart Week
 * with an explanation is a decision to make; one without is a hole nobody
 * notices for a month, and ADR 0002 makes that permanent.
 */
test('a Chart Week fetched and refused is Missing, and the run says why', async () => {
  const [twoBack, oneBack] = [weeksBeforeDue(2), weeksBeforeDue(1)]
  const api = apiFor([twoBack, DUE])
  const halfScraped = apiFor([oneBack], records.slice(0, 99))

  await ingest(api, twoBack)
  await ingest(halfScraped, oneBack)
  await ingest(api, DUE)

  const health = await healthOf(api)
  expect(health.held).toEqual([twoBack, DUE])
  expect(health.missing).toEqual([oneBack])

  const explanation = await api.request(
    `/api/internal/runs?chart=uk-singles&date=${oneBack}`,
    { headers: { authorization: `Bearer ${OPERATOR_SECRET}` } },
  )
  expect(await explanation.json()).toMatchObject({
    runs: [
      {
        date: oneBack,
        status: 'rejected',
        failure: expect.stringContaining('has 99 Entries; uk-singles has 100'),
      },
    ],
  })
})

test('a Chart Waveger does not have has no archive to report on', async () => {
  const response = await apiFor().request('/api/internal/archive?chart=uk-albums', {
    headers: { authorization: `Bearer ${OPERATOR_SECRET}` },
  })

  expect(response.status).toBe(404)
  expect(await response.json()).toMatchObject({ error: 'not_found' })
})

test('archive health is behind the shared secret like everything else', async () => {
  const response = await apiFor().request('/api/internal/archive?chart=uk-singles')

  expect(response.status).toBe(401)
  expect(await response.json()).toMatchObject({ error: 'unauthorised' })
})

test('a request naming no Chart is refused', async () => {
  const response = await apiFor().request('/api/internal/archive', {
    headers: { authorization: `Bearer ${OPERATOR_SECRET}` },
  })

  expect(response.status).toBe(422)
  expect(await response.json()).toMatchObject({ error: 'invalid_request' })
})
