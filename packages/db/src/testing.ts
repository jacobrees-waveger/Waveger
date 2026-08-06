import { randomUUID } from 'node:crypto'
import type { Kysely } from 'kysely'
import pg from 'pg'
import { assertSafeIdentifier, createDb } from './client'
import { unpooledConnectionString } from './env'
import { migrateToLatest } from './migrations'
import type { Database } from './schema'

export interface TestDatabase {
  db: Kysely<Database>
  /** The Postgres schema this database is confined to. */
  schema: string
  /** Closes the pool and drops the schema. Always call it. */
  dispose(): Promise<void>
}

/**
 * A real Postgres database, private to one test.
 *
 * Isolation is by schema: every call creates a fresh one, migrates it, and
 * pins the connection's `search_path` to it, so concurrent tests cannot see
 * each other's rows and none of them need to clean up after themselves. It is
 * the same database server the application uses — nothing here is a stub, and
 * a query that Postgres would reject in production is rejected here too.
 */
export async function createTestDatabase(): Promise<TestDatabase> {
  const connectionString = unpooledConnectionString()
  const schema = `test_${randomUUID().replaceAll('-', '')}`

  await migrateToLatest({ connectionString, schema })
  const db = createDb({ connectionString, schema, max: 1 })

  return {
    db,
    schema,
    async dispose() {
      await db.destroy()
      await dropSchema(connectionString, schema)
    },
  }
}

async function dropSchema(
  connectionString: string,
  schema: string,
): Promise<void> {
  assertSafeIdentifier(schema)
  const client = new pg.Client({ connectionString })
  await client.connect()
  try {
    await client.query(`drop schema if exists "${schema}" cascade`)
  } finally {
    await client.end()
  }
}
