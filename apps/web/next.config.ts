import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import type { NextConfig } from 'next'

// Next only reads `.env*` from its own directory, but `vercel env pull` writes
// one file at the repository root for the whole monorepo (ADR 0008). Load it
// here, before the server starts. A deployment has no such file — the platform
// has already put the variables in the environment — hence the check.
const rootEnv = fileURLToPath(new URL('../../.env.local', import.meta.url))
if (existsSync(rootEnv)) {
  process.loadEnvFile(rootEnv)
}

const nextConfig: NextConfig = {
  // The shared packages ship TypeScript source rather than a build output, so
  // there is no build step to keep in sync and no stale `dist` to debug.
  transpilePackages: [
    '@waveger/api',
    '@waveger/api-client',
    '@waveger/db',
    '@waveger/domain',
  ],
}

export default nextConfig
