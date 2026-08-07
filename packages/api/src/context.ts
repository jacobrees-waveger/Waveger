import type { Database } from '@waveger/db'
import type { ApiError, ApiErrorCode } from '@waveger/domain'
import type { Kysely } from 'kysely'
import type { RetryPolicy } from './chart/retry'
import type { ChartSource } from './chart/source'

/**
 * Everything a handler is allowed to reach for.
 *
 * ADR 0006 requires handlers to take a Web-standard `Request` and import
 * nothing from `next/*`. Dependencies therefore arrive through the Hono
 * context rather than through module-level imports, which is also the seam the
 * tests use to hand a route its own private database.
 */
export interface ApiEnv {
  Variables: {
    db: Kysely<Database>
    chartSource: ChartSource
    /**
     * How many times a failed fetch is tried again, and how long it waits in
     * between. Here rather than inside ingestion so a test can drive the retry
     * without also driving a clock — the same seam, for the same reason.
     */
    ingestionRetry: RetryPolicy
  }
}

/**
 * The body of every non-2xx response.
 *
 * A function rather than four object literals, so the `error` field is held to
 * the codes this API admits to emitting. `apiErrorSchema` types it as a plain
 * string on the wire on purpose — that leniency is for clients that shipped
 * before the code existed, not for us.
 */
export function errorBody(error: ApiErrorCode, message: string): ApiError {
  return { error, message }
}

/**
 * Every route that takes a Chart slug can be handed one Waveger has never heard
 * of, and they all say so the same way. Worth naming once: the wording is what
 * an operator reads when they have mistyped a slug, and three copies of it is
 * three chances for one of them to say something subtly different.
 */
export const unknownChart = (slug: string): ApiError =>
  errorBody('not_found', `Waveger has no Chart called ${slug}.`)
