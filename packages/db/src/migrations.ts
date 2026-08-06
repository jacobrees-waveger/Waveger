import { readFile, readdir } from 'node:fs/promises'
import { basename, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import pg from 'pg'
import { assertSafeIdentifier } from './client'

/**
 * The migration runner.
 *
 * ADR 0004 chose a query builder, not an ORM, so migrations are hand-written
 * SQL files and this applies them in filename order, recording each one in
 * `schema_migration`. There is no `down`: the engineering principles remove
 * obsolete paths rather than reverse into them.
 *
 * Each file is sent as a single statement string over Postgres' simple query
 * protocol, which is what lets one file contain several statements. Kysely's
 * own query path always sends a parameter array and therefore uses the
 * extended protocol, which rejects multi-statement SQL — that, not preference,
 * is why this talks to `pg` directly.
 */

const migrationsDirectory = fileURLToPath(
  new URL('../migrations/', import.meta.url),
)

/** Constant, arbitrary: serialises concurrent runners against one database. */
const ADVISORY_LOCK_KEY = 4_012_001

export interface MigrateOptions {
  /** Must be the direct connection — see `unpooledConnectionString`. */
  connectionString: string
  /** Apply into this schema, creating it if needed. Defaults to `public`. */
  schema?: string
  log?: (message: string) => void
}

/** Applies every pending migration. Returns the names of the ones it ran. */
export async function migrateToLatest(
  options: MigrateOptions,
): Promise<string[]> {
  const { connectionString, schema, log } = options
  const client = new pg.Client({ connectionString })
  await client.connect()

  try {
    if (schema !== undefined) {
      assertSafeIdentifier(schema)
      await client.query(`create schema if not exists "${schema}"`)
      await client.query(`set search_path to "${schema}"`)
    }

    // Held for the session; released when the client disconnects below.
    await client.query('select pg_advisory_lock($1)', [ADVISORY_LOCK_KEY])

    const applied = await appliedMigrations(client)

    const pending = (await readdir(migrationsDirectory))
      .filter((file) => file.endsWith('.sql'))
      .sort()
      .map((file) => ({ name: basename(file, '.sql'), file }))
      .filter((migration) => !applied.has(migration.name))

    const ran: string[] = []
    for (const { name, file } of pending) {
      const statements = await readFile(join(migrationsDirectory, file), 'utf8')
      await client.query('begin')
      try {
        await client.query(statements)
        await client.query('insert into schema_migration (name) values ($1)', [
          name,
        ])
        await client.query('commit')
      } catch (cause) {
        await client.query('rollback')
        throw new Error(`Migration ${name} failed`, { cause })
      }
      ran.push(name)
      log?.(`applied ${name}`)
    }

    return ran
  } finally {
    await client.end()
  }
}

/** Postgres `undefined_table`. */
const UNDEFINED_TABLE = '42P01'

/**
 * The ledger is itself the first migration, so on a virgin database the table
 * this reads does not exist yet. That is the only situation in which its
 * absence is not an error, and it is indistinguishable from "nothing applied".
 */
async function appliedMigrations(client: pg.Client): Promise<Set<string>> {
  try {
    const { rows } = await client.query<{ name: string }>(
      'select name from schema_migration',
    )
    return new Set(rows.map((row) => row.name))
  } catch (error) {
    if ((error as { code?: string }).code !== UNDEFINED_TABLE) throw error
    return new Set()
  }
}
