import type { Database } from '@waveger/db'
import type { Kysely } from 'kysely'

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
  }
}
