import { OpenAPIHono } from '@hono/zod-openapi'
import type { Database } from '@waveger/db'
import type { Kysely } from 'kysely'
import { defaultRetryPolicy, type RetryPolicy } from './chart/retry'
import type { ChartSource } from './chart/source'
import { errorBody, type ApiEnv } from './context'
import { requireOperatorSecret } from './operator-secret'
import { latestChartWeekHandler, latestChartWeekRoute } from './routes/chart-weeks'
import {
  ingestHandler,
  ingestRoute,
  scheduledIngestHandler,
  scheduledIngestRoute,
} from './routes/ingest'
import { runsHandler, runsRoute } from './routes/runs'
import { statusHandler, statusRoute } from './routes/status'

/**
 * ADR 0006: one API, versioned from the first commit, mounted inside the
 * Next.js deployment. The namespace is part of the contract — a shipped native
 * binary cannot be recalled, so `/api/v1` only ever grows.
 */
const API_BASE_PATH = '/api/v1'

/**
 * Ingestion and its run log (ADR 0011). Deliberately outside the versioned
 * namespace and absent from the OpenAPI document: these routes serve the
 * operator, promise nothing to any client, and are free to change. They are
 * validated like every other route — it is the promise that is withheld, not
 * the checking.
 *
 * Under `/api` rather than beside it because the whole Hono app reaches the
 * world through one Next.js catch-all at `/api`, and ADR 0006 keeps that the
 * only adapter between the two. A second one for a second prefix would be a
 * second place to remember when the API moves out.
 */
const OPERATOR_BASE_PATH = '/api/internal'

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
  /** The one route by which chart data enters Waveger (ADR 0002). */
  chartSource: ChartSource
  /**
   * The shared secret `/api/internal/*` demands as `Authorization: Bearer`.
   *
   * Undefined is a state rather than an omission: the operator routes close
   * instead of opening, so a deployment that never got the variable refuses
   * them rather than serving them to the internet.
   */
  operatorSecret: string | undefined
  /**
   * How a failed fetch is tried again. Optional because the answer is the same
   * for every deployment; it is a parameter at all so the tests can exercise
   * retry, resume and exhaustion without waiting out the backoff.
   */
  ingestionRetry?: RetryPolicy
}

/**
 * A validated app. ADR 0006 puts Zod on the routes from the first commit, and
 * this is the one place a request that does not satisfy a route's schema is
 * turned into a response: 422, in the same envelope as every other failure.
 */
const validatedApp = () =>
  new OpenAPIHono<ApiEnv>({
    defaultHook: (result, c) =>
      result.success
        ? undefined
        : c.json(errorBody('invalid_request', result.error.message), 422),
  })

/**
 * The public API. Every route here is in the OpenAPI document and none of them
 * may break: this is the contract a shipped binary holds Waveger to.
 */
function buildPublicApi() {
  const v1 = validatedApp().basePath(API_BASE_PATH)

  v1.openapi(statusRoute, statusHandler)
  v1.openapi(latestChartWeekRoute, latestChartWeekHandler)
  v1.doc31(OPENAPI_PATH, openApiInfo)

  return v1
}

function buildOperatorApi(operatorSecret: string | undefined) {
  const operator = validatedApp().basePath(OPERATOR_BASE_PATH)

  // Before the routes, so it runs before them and covers every one that is
  // added later without anyone having to remember to guard it.
  operator.use('*', requireOperatorSecret(operatorSecret))

  operator.openapi(ingestRoute, ingestHandler)
  operator.openapi(scheduledIngestRoute, scheduledIngestHandler)
  operator.openapi(runsRoute, runsHandler)

  return operator
}

/**
 * The API, ready to serve. Everything it needs is passed in.
 *
 * ADR 0006 requires handlers to import nothing from `next/*`, so their
 * dependencies arrive through the Hono context rather than through
 * module-level imports — which is also the seam the tests use to hand a route
 * its own private database and its own `ChartSource`.
 */
export function createApi(options: CreateApiOptions) {
  const app = new OpenAPIHono<ApiEnv>()

  // Registered before the routes so it runs before them.
  app.use('*', async (c, next) => {
    c.set('db', options.db)
    c.set('chartSource', options.chartSource)
    c.set('ingestionRetry', options.ingestionRetry ?? defaultRetryPolicy)
    await next()
  })

  app.route('/', buildPublicApi())
  app.route('/', buildOperatorApi(options.operatorSecret))

  app.notFound((c) =>
    c.json(errorBody('not_found', `No route for ${c.req.path}`), 404),
  )
  app.onError((error, c) =>
    c.json(errorBody('internal_error', error.message), 500),
  )

  return app
}

/** The OpenAPI document, built from the same route definitions the server uses. */
export const createOpenApiDocument = () =>
  buildPublicApi().getOpenAPI31Document(openApiInfo)
