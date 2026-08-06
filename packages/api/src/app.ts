import { OpenAPIHono } from '@hono/zod-openapi'
import type { Database } from '@waveger/db'
import type { Kysely } from 'kysely'
import { errorBody, type ApiEnv } from './context'
import { statusHandler, statusRoute } from './routes/status'

/**
 * ADR 0006: one API, versioned from the first commit, mounted inside the
 * Next.js deployment. The namespace is part of the contract — a shipped native
 * binary cannot be recalled, so `/api/v1` only ever grows.
 */
const API_BASE_PATH = '/api/v1'

const OPENAPI_PATH = '/openapi.json'

const openApiInfo = {
  openapi: '3.1.0',
  info: {
    title: 'Waveger API',
    version: 'v1',
    description:
      'The one API behind both Waveger apps. Evolves additively: routes and ' +
      'fields are added, never removed or repurposed. Any path this document ' +
      'does not list answers 404 in the same ApiError envelope every failure ' +
      'below uses.',
  },
} as const

export interface CreateApiOptions {
  db: Kysely<Database>
}

/**
 * The API, ready to serve. Everything it needs is passed in.
 *
 * `db` is optional internally only so that `createOpenApiDocument` can build
 * the same routes without one; generating the document never runs a handler.
 */
function buildApp(db?: Kysely<Database>) {
  const app = new OpenAPIHono<ApiEnv>({
    // The validation policy for every route, set once. ADR 0006 puts Zod on
    // the routes from the first commit because it is free now and expensive
    // to retrofit; no route takes a request body or parameter yet, so this is
    // the policy waiting for its first input rather than something in use.
    defaultHook: (result, c) =>
      result.success
        ? undefined
        : c.json(errorBody('invalid_request', result.error.message), 422),
  }).basePath(API_BASE_PATH)

  // Registered before the routes so it runs before them.
  if (db !== undefined) {
    app.use('*', async (c, next) => {
      c.set('db', db)
      await next()
    })
  }

  app.openapi(statusRoute, statusHandler)
  app.doc31(OPENAPI_PATH, openApiInfo)

  app.notFound((c) =>
    c.json(errorBody('not_found', `No route for ${c.req.path}`), 404),
  )
  app.onError((error, c) =>
    c.json(errorBody('internal_error', error.message), 500),
  )

  return app
}

export const createApi = ({ db }: CreateApiOptions) => buildApp(db)

/** The OpenAPI document, built from the same route definitions the server uses. */
export const createOpenApiDocument = () =>
  buildApp().getOpenAPI31Document(openApiInfo)
