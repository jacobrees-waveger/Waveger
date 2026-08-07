/**
 * What the application needs to talk to Postgres, and nothing else.
 *
 * The migration runner is deliberately *not* re-exported here: it reads SQL
 * files off disk, which no serverless bundle should be dragged into resolving.
 * Import it from `@waveger/db/migrations`, and the test harness from
 * `@waveger/db/testing`.
 */
export { createDb, type CreateDbOptions } from './client'
export type { Database, IngestionFlag } from './schema'
