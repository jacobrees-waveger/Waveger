import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

/**
 * Environment variables are injected by Vercel, never hand-written — locally
 * they arrive in the repo-root `.env.local` via `vercel env pull` (ADR 0008).
 * In a deployed function they are already in `process.env` and there is no
 * file to read, hence the existence check.
 */
export function loadRootEnv(): void {
  const envFile = fileURLToPath(new URL('../../../.env.local', import.meta.url))
  if (existsSync(envFile)) {
    process.loadEnvFile(envFile)
  }
}

/**
 * The direct, unpooled connection string.
 *
 * Migrations and tests must not go through the pooler. A pooled connection
 * hands each statement to whichever backend is free, so session state — the
 * `search_path` the test harness relies on — does not survive between
 * statements, and long DDL transactions fail intermittently under load rather
 * than immediately. That intermittency is the whole reason this is a named
 * function and not an inline `process.env` read.
 */
export function unpooledConnectionString(): string {
  loadRootEnv()
  const connectionString = process.env.DATABASE_URL_UNPOOLED
  if (!connectionString) {
    throw new Error(
      'DATABASE_URL_UNPOOLED is not set. Run `vercel env pull .env.local` from the repository root.',
    )
  }
  return connectionString
}
