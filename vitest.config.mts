import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['packages/**/*.test.ts'],
    // Every test opens its own direct (unpooled) Postgres connection, and the
    // direct endpoint has a far lower connection ceiling than the pooler.
    // Files run one at a time so the suite cannot exhaust it.
    fileParallelism: false,
    testTimeout: 30_000,
  },
})
