import { Kysely, PostgresDialect } from 'kysely'
import pg from 'pg'
import type { Database } from './schema'

export interface CreateDbOptions {
  connectionString: string
  /**
   * Postgres schema to resolve unqualified table names in. The test harness
   * uses this to give every test its own copy of the database; production
   * leaves it unset and uses `public`.
   *
   * Passed as a connection start-up option rather than a `SET` statement, so
   * it applies to every connection the pool opens. This only holds on a direct
   * connection — see `unpooledConnectionString`.
   */
  schema?: string
  /** Pool size. Serverless functions want a small one; tests want 1. */
  max?: number
}

/**
 * A Postgres DATE arrives as the string it is, not as a `Date`.
 *
 * The driver's default turns 2026-07-31 into midnight *local* time, so a Chart
 * Week published on a Friday reads as the Thursday for anyone west of UTC, and
 * every date that goes back out is one day out. Chart Weeks are calendar dates
 * and carry no instant, so the honest representation is the string Postgres
 * already sent. Timestamps are unaffected — they really are instants.
 *
 * Global to the driver by necessity, so it is done here, in the one module
 * every database caller loads.
 */
pg.types.setTypeParser(pg.types.builtins.DATE, (value) => value)

const SAFE_IDENTIFIER = /^[a-z_][a-z0-9_]*$/

export function assertSafeIdentifier(identifier: string): void {
  if (!SAFE_IDENTIFIER.test(identifier)) {
    throw new Error(`Unsafe Postgres identifier: ${identifier}`)
  }
}

export function createDb(options: CreateDbOptions): Kysely<Database> {
  const { connectionString, schema, max = 10 } = options
  if (schema !== undefined) assertSafeIdentifier(schema)

  return new Kysely<Database>({
    dialect: new PostgresDialect({
      pool: new pg.Pool({
        connectionString,
        max,
        options: schema === undefined ? undefined : `-c search_path=${schema}`,
      }),
    }),
  })
}
