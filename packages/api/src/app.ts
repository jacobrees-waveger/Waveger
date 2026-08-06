import { OpenAPIHono } from '@hono/zod-openapi'
import type { Database } from '@waveger/db'
import type { Kysely } from 'kysely'
import type { ApiEnv } from './env'
import { registerStatusRoute } from './routes/status'

/**
 * ADR 0006: one API, versioned from the first commit, mounted inside the
 * Next.js deployment. The namespace is part of the contract — a shipped native
 * binary cannot be recalled, so `/api/v1` only ever grows.
 */
export const API_BASE_PATH = '/api/v1'

export const OPENAPI_PATH = '/openapi.json'

export const openApiInfo = {
  openapi: '3.1.0',
  info: {
    title: 'Waveger API',
    version: 'v1',
    description:
      'The one API behind both Waveger apps. Evolves additively: routes and ' +
      'fields are added, never removed or repurposed.',
  },
} as const

function buildApp(db?: Kysely<Database>) {
  const app = new OpenAPIHono<ApiEnv>({
    // Rejects a request whose body, params or query fail their Zod schema, in
    // the same error shape every other failure uses. Set once, for every route.
    defaultHook: (result, c) => {
      if (!result.success) {
        return c.json(
          { error: 'invalid_request', message: result.error.message },
          422,
        )
      }
      return undefined
    },
  }).basePath(API_BASE_PATH)

  // Registered before the routes so it runs before them.
  if (db !== undefined) {
    app.use('*', async (c, next) => {
      c.set('db', db)
      await next()
    })
  }

  registerStatusRoute(app)
  app.doc31(OPENAPI_PATH, openApiInfo)

  app.notFound((c) =>
    c.json({ error: 'not_found', message: `No route for ${c.req.path}` }, 404),
  )
  app.onError((error, c) =>
    c.json({ error: 'internal_error', message: error.message }, 500),
  )

  return app
}

export interface CreateApiOptions {
  db: Kysely<Database>
}

/** The API, ready to serve. Everything it needs is passed in. */
export function createApi(options: CreateApiOptions) {
  return buildApp(options.db)
}

/**
 * The OpenAPI document, built from the same route definitions the server
 * uses. No database: generating the document never runs a handler.
 */
export function createOpenApiDocument() {
  return buildApp().getOpenAPI31Document(openApiInfo)
}
