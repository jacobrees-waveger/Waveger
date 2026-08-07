import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { createTestDatabase, type TestDatabase } from '@waveger/db/testing'
import { apiStatusSchema } from '@waveger/domain'
import { sql } from 'kysely'
import { afterEach, beforeEach, expect, test } from 'vitest'
import { createApi } from '../app'
import { createFixtureChartSource } from '../chart/fixture-source'

/**
 * These tests drive the real Hono app with `app.request()` against a real
 * Postgres — no HTTP server, no mocked database. Each one gets its own schema,
 * migrated from the same SQL files a deployment runs.
 */

let database: TestDatabase
let api: ReturnType<typeof createApi>

beforeEach(async () => {
  database = await createTestDatabase()
  api = createApi({
    db: database.db,
    chartSource: createFixtureChartSource(),
    operatorSecret: undefined,
  })
})

afterEach(async () => {
  await database.dispose()
})

test('GET /api/v1/status reports the migrated database', async () => {
  const response = await api.request('/api/v1/status')

  expect(response.status).toBe(200)

  const body = apiStatusSchema.parse(await response.json())
  expect(body.service).toBe('waveger-api')
  expect(body.version).toBe('v1')
  expect(body.database.reachable).toBe(true)
  expect(body.database.migrations).toEqual([
    '0001_create_schema_migration',
    '0002_create_chart_archive',
  ])
})

test('a table created in one test database is invisible to another', async () => {
  await sql`create table isolation_probe (id integer)`.execute(database.db)

  const neighbour = await createTestDatabase()
  try {
    expect(neighbour.schema).not.toBe(database.schema)

    const visible = async (test: TestDatabase) => {
      const { rows } = await sql<{
        found: string | null
      }>`select to_regclass('isolation_probe')::text as found`.execute(test.db)
      return rows[0]?.found !== null
    }

    expect(await visible(database)).toBe(true)
    expect(await visible(neighbour)).toBe(false)
  } finally {
    await neighbour.dispose()
  }
})

test('the served OpenAPI document matches the committed one', async () => {
  const response = await api.request('/api/v1/openapi.json')

  expect(response.status).toBe(200)

  const committed = JSON.parse(
    await readFile(
      fileURLToPath(new URL('../../openapi.json', import.meta.url)),
      'utf8',
    ),
  )
  expect(await response.json()).toEqual(committed)
})

test('an unknown route answers in the documented error shape', async () => {
  const response = await api.request('/api/v1/nope')

  expect(response.status).toBe(404)
  expect(await response.json()).toMatchObject({ error: 'not_found' })
})
