import type { Generated, JSONColumnType } from 'kysely'

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

/** An externally compiled ranking. Reference data, seeded by a migration. */
export interface ChartTable {
  slug: string
  name: string
  position_count: number
}

/**
 * One published edition of a Chart.
 *
 * `week_date` is a string rather than a `Date` on purpose — a Chart Week is a
 * calendar date, and the DATE parser in `client.ts` keeps it one.
 */
export interface ChartWeekTable {
  id: Generated<string>
  chart_slug: string
  week_date: string
}

export interface SongTable {
  id: Generated<string>
  fingerprint: string
  title: string
  artist: string
}

export interface EntryTable {
  chart_week_id: string
  position: number
  song_id: string
  peak_position: number
  weeks_on_chart: number
}

/** What ingestion noticed but did not act on. */
export interface IngestionFlag {
  kind: 'artist_over_cap'
  artist: string
  entries: number
}

/**
 * What happened every time ingestion ran.
 *
 * The two JSON columns insert as strings because the pg driver turns a JS array
 * parameter into a Postgres *array* literal, not JSON — so they are stringified
 * at the call site rather than silently mangled here.
 */
export interface IngestionRunTable {
  id: Generated<string>
  chart_slug: string
  week_date: string
  status: 'succeeded' | 'failed'
  failure: string | null
  flags: JSONColumnType<IngestionFlag[]>
  payload: JSONColumnType<object> | null
  ran_at: Generated<Date>
}

export interface Database {
  schema_migration: SchemaMigrationTable
  chart: ChartTable
  chart_week: ChartWeekTable
  song: SongTable
  entry: EntryTable
  ingestion_run: IngestionRunTable
}
