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

/**
 * An externally compiled ranking. Reference data, seeded by a migration.
 *
 * `slug` and `name` are Waveger's. `compiler_slug` and `compiler_chart_id` are
 * how the Chart Compiler addresses this same Chart, and together with a date
 * they are what a Chart Week is fetched by (ADR 0017).
 */
export interface ChartTable {
  slug: string
  name: string
  position_count: number
  compiler_slug: string
  compiler_chart_id: number
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

/**
 * The act credited on a Song, as the Chart Compiler resolves it.
 *
 * `id` is the Compiler's, not ours: which credits count as the same Artist is
 * its rule and never Waveger's (`CONTEXT.md`). Text rather than a number
 * because it arrives as a path segment and is only ever compared.
 */
export interface ArtistTable {
  id: string
  name: string
}

export interface EntryTable {
  chart_week_id: string
  position: number
  song_id: string
  peak_position: number
  weeks_on_chart: number
  /** Null when the source that fetched this Entry reported no Artist. */
  artist_id: string | null
}

/** What ingestion noticed but did not act on. */
export interface IngestionFlag {
  kind: 'artist_over_cap'
  artist: string
  entries: number
}

/**
 * How a run ended. Three outcomes, because the two ways of failing send an
 * operator to different places: `rejected` is a source that answered with
 * something that is not a Chart Week, `unavailable` a source that did not
 * answer at all.
 */
export type IngestionRunStatus = 'succeeded' | 'rejected' | 'unavailable'

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
  status: IngestionRunStatus
  /** Why the run held nothing. Null exactly when it succeeded. */
  failure: string | null
  flags: JSONColumnType<IngestionFlag[]>
  payload: JSONColumnType<object> | null
  /**
   * Which `ChartSource` answered, in the adapter's own name for itself.
   *
   * Waveger has two working adapters and a deployment is wired to one of them
   * (ADR 0017), which is a fact about the deploy and not about the week — so
   * without this a Chart Week fetched during a fallback reads exactly like one
   * fetched normally.
   *
   * Nullable, and null means the run predates the column rather than that the
   * source was unknown. Nullable also makes it optional on insert, which is
   * what lets the schema land a PR ahead of the code that writes it (ADR 0015).
   */
  source: string | null
  ran_at: Generated<Date>
}

export interface Database {
  schema_migration: SchemaMigrationTable
  chart: ChartTable
  chart_week: ChartWeekTable
  song: SongTable
  artist: ArtistTable
  entry: EntryTable
  ingestion_run: IngestionRunTable
}
