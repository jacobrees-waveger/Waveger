import { createRoute } from '@hono/zod-openapi'
import { apiErrorSchema, apiStatusSchema, type ApiStatus } from '@waveger/domain'
import type { RouteHandler } from '@hono/zod-openapi'
import { errorBody, type ApiEnv } from '../context'

export const statusRoute = createRoute({
  method: 'get',
  path: '/status',
  tags: ['Service'],
  summary: 'Service and database status',
  description:
    'Confirms the API is running, that it can reach Postgres, and which ' +
    'migrations that database has had applied.',
  responses: {
    200: {
      description: 'The service is up and the database is reachable.',
      content: { 'application/json': { schema: apiStatusSchema } },
    },
    503: {
      description: 'The service is up but the database is not reachable.',
      content: { 'application/json': { schema: apiErrorSchema } },
    },
  },
})

export const statusHandler: RouteHandler<typeof statusRoute, ApiEnv> = async (
  c,
) => {
  let migrations: string[]
  try {
    const rows = await c
      .get('db')
      .selectFrom('schema_migration')
      .select('name')
      .orderBy('name')
      .execute()
    migrations = rows.map((row) => row.name)
  } catch (cause) {
    return c.json(
      errorBody(
        'database_unreachable',
        cause instanceof Error ? cause.message : String(cause),
      ),
      503,
    )
  }

  // Parsed, not merely typed: the served body is checked against the same
  // schema the OpenAPI document is generated from, so the two cannot drift.
  const body = apiStatusSchema.parse({
    service: 'waveger-api',
    version: 'v1',
    database: { reachable: true, migrations },
  } satisfies ApiStatus)

  return c.json(body, 200)
}
