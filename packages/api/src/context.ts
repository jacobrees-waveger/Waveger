import type { Database } from '@waveger/db'
import type { ApiError, ApiErrorCode } from '@waveger/domain'
import type { Kysely } from 'kysely'
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
