import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { createTestDatabase, type TestDatabase } from '@waveger/db/testing'
import { ApiRequestError, createApiClient } from '@waveger/api-client'
import { afterEach, beforeEach, expect, test } from 'vitest'
import { createApi } from './app'
import { createFixtureChartSource } from './chart/fixture-source'

/**
 * The shared client against the real API, over real HTTP.
 *
 * The other suites call `api.request()` directly, which never leaves the
 * process and so cannot see anything about headers on the wire. Both apps
 * reach the API the way this test does, and one thing that only shows up out
 * here is authorisation: the client has to carry the caller's credentials
 * through, or a Server Component rendering a protected preview deployment is
 * refused at the edge before the Hono app is ever asked.
 *
 * The client only issues GETs, so the bridge below handles no request body.
 */

let database: TestDatabase
let server: Server
let origin: string
let received: Record<string, string | string[] | undefined>[]

beforeEach(async () => {
  database = await createTestDatabase()
  const api = createApi({
    db: database.db,
    chartSource: createFixtureChartSource(),
    // The client only ever calls `/api/v1`, which is public throughout.
    operatorSecret: undefined,
  })
  received = []

  server = createServer((request, response) => {
    received.push(request.headers)
    void (async () => {
      const url = new URL(request.url ?? '/', 'http://api.test')
      const answer = await api.request(url.pathname + url.search, {
        headers: new Headers(
          Object.entries(request.headers).flatMap(([name, value]) =>
            typeof value === 'string' ? [[name, value] as [string, string]] : [],
          ),
        ),
      })
      response.writeHead(answer.status, Object.fromEntries(answer.headers))
      response.end(Buffer.from(await answer.arrayBuffer()))
    })()
  })

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})

afterEach(async () => {
  await new Promise((resolve) => server.close(resolve))
  await database.dispose()
})

test('the client reads a status the API really served', async () => {
  const status = await createApiClient({ baseUrl: origin }).getStatus()

  expect(status.service).toBe('waveger-api')
  expect(status.database.reachable).toBe(true)
  expect(status.database.migrations).toEqual([
    '0001_create_schema_migration',
    '0002_create_chart_archive',
    '0003_split_the_ingestion_run_outcomes',
  ])
  expect(received[0]?.accept).toBe('application/json')
})

test('configured headers reach the API', async () => {
  const client = createApiClient({
    baseUrl: origin,
    headers: { cookie: '_vercel_jwt=viewer-token' },
  })

  await client.getStatus()

  expect(received[0]?.cookie).toBe('_vercel_jwt=viewer-token')
  expect(received[0]?.accept).toBe('application/json')
})

test('a client given no headers sends none', async () => {
  await createApiClient({ baseUrl: origin }).getStatus()

  expect(received[0]?.cookie).toBeUndefined()
})

test('an error the API documents keeps its code', async () => {
  const client = createApiClient({ baseUrl: `${origin}/nowhere` })

  await expect(client.getStatus()).rejects.toBeInstanceOf(ApiRequestError)
  await expect(client.getStatus()).rejects.toMatchObject({
    status: 404,
    code: 'not_found',
  })
})
