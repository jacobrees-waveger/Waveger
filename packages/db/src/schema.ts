import type { Generated } from 'kysely'

/**
 * The database as Kysely sees it. Hand-written to match the SQL in
 * `migrations/`, because ADR 0004 chose a query builder over an ORM: there is
 * no schema DSL to generate this from, and no generator to keep in step.
 *
 * Adding a migration means editing this file in the same commit.
 */

/** Written by the migration runner, never by application code. */
export interface SchemaMigrationTable {
  name: string
  applied_at: Generated<Date>
}

export interface Database {
  schema_migration: SchemaMigrationTable
}
