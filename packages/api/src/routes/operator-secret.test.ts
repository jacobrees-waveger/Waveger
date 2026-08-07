import { createTestDatabase, type TestDatabase } from '@waveger/db/testing'
import { afterEach, beforeEach, expect, test } from 'vitest'
import { createApi } from '../app'
import { createFixtureChartSource } from '../chart/fixture-source'

/**
 * The shared secret in front of `/api/internal/*` (ADR 0011).
 *
 * Every other operator test sends the secret and asserts what the route does.
 * This file is the other half: what happens when it is wrong, absent, or was
 * never configured. It matters more than a guard usually would, because the
 * routes behind it write to the archive and spend money doing it.
 */

let database: TestDatabase

const SECRET = 'test-operator-secret'

/**
 * Deliberately no default for `operatorSecret`. A default would be reached by
 * passing `undefined` explicitly, which is exactly the case the last two tests
 * below exist to cover — they would have run against a configured secret and
 * passed for the wrong reason.
 */
const apiFor = (operatorSecret: string | undefined) =>
  createApi({
    db: database.db,
    chartSource: createFixtureChartSource(),
    operatorSecret,
  })

const configured = () => apiFor(SECRET)

const ingest = (
  api: ReturnType<typeof createApi>,
  headers: Readonly<Record<string, string>> = {},
) =>
  api.request('/api/internal/ingest', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify({ chart: 'uk-singles', date: '2026-07-31' }),
  })

const heldWeeks = async (): Promise<number> => {
  const rows = await database.db.selectFrom('chart_week').select('id').execute()
  return rows.length
}

beforeEach(async () => {
  database = await createTestDatabase()
})

afterEach(async () => {
  await database.dispose()
})

const refused: { offering: string; headers: Record<string, string> }[] = [
  { offering: 'no Authorization header at all', headers: {} },
  { offering: 'the wrong secret', headers: { authorization: 'Bearer wrong' } },
  {
    offering: 'the secret without the scheme',
    headers: { authorization: SECRET },
  },
  { offering: 'an empty bearer', headers: { authorization: 'Bearer ' } },
  {
    offering: 'a prefix of the secret',
    headers: { authorization: `Bearer ${SECRET.slice(0, -1)}` },
  },
]

test.each(refused)('ingestion offering $offering is refused', async ({ headers }) => {
  const response = await ingest(configured(), headers)

  expect(response.status).toBe(401)
  expect(await response.json()).toMatchObject({ error: 'unauthorised' })
})

/**
 * The refusal has to happen before the handler, not inside it. A 401 that
 * still wrote an `ingestion_run` row would be a rate-limit-free way to fill
 * the table, and a way to spend the Apify budget.
 */
test('a refused call reaches nothing behind the guard', async () => {
  await ingest(configured(), {})

  expect(await heldWeeks()).toBe(0)
  const runs = await database.db
    .selectFrom('ingestion_run')
    .select('id')
    .execute()
  expect(runs).toEqual([])
})

test('the right secret gets through to the route', async () => {
  const response = await ingest(configured(), {
    authorization: `Bearer ${SECRET}`,
  })

  expect(response.status).toBe(200)
  expect(await heldWeeks()).toBe(1)
})

test('the run log is guarded too, not just the route that writes', async () => {
  const api = configured()
  const path = '/api/internal/runs?chart=uk-singles&date=2026-07-31'

  expect((await api.request(path)).status).toBe(401)
  expect(
    (await api.request(path, {
      headers: { authorization: `Bearer ${SECRET}` },
    })).status,
  ).toBe(200)
})

/**
 * A deployment nobody gave a secret to closes its operator routes rather than
 * opening them. The failure this guards against is exactly the one where the
 * variable was never set and nobody noticed, so the safe default cannot be to
 * let everything through.
 */
test.each([
  { configured: 'never set', secret: undefined },
  { configured: 'set to an empty string', secret: '' },
])(
  'a deployment whose secret was $configured refuses its operator routes',
  async ({ secret }) => {
    const response = await ingest(apiFor(secret), {
      authorization: `Bearer ${SECRET}`,
    })

    expect(response.status).toBe(503)
    expect(await response.json()).toMatchObject({
      error: 'operator_unconfigured',
    })
    expect(await heldWeeks()).toBe(0)
  },
)

/**
 * `/api/v1` is public and stays public. The secret guards the operator
 * namespace and must not leak across the boundary ADR 0011 draws — a visitor
 * reading the chart carries no credentials of any kind.
 */
test('the public API is untouched by the secret', async () => {
  const api = configured()
  await ingest(api, { authorization: `Bearer ${SECRET}` })

  const week = await api.request('/api/v1/chart-weeks/latest')
  const status = await api.request('/api/v1/status')

  expect([week.status, status.status]).toEqual([200, 200])
})

test('the public API works even where no operator secret is configured', async () => {
  const response = await apiFor(undefined).request('/api/v1/status')

  expect(response.status).toBe(200)
})
