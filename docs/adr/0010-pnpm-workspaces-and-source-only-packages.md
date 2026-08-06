# pnpm workspaces, a version catalogue, and packages that ship source

The monorepo is plain pnpm workspaces. There is no build orchestrator, and the
shared packages under `packages/` have no build step: each one's `exports` field
points straight at `src/index.ts`, and the consumer compiles it.

## Considered options

- **Turborepo.** Its value is task orchestration and remote caching across many
  packages. With two apps, four packages and no CI matrix, it would be
  configuration whose benefit has not arrived yet. `pnpm -r` covers the
  fan-out; `pnpm --filter` covers the targeting. Adding Turborepo later is a
  config file, not a migration.
- **Compiled packages** (`tsup`/`tsdown` producing `dist/`). Rejected because it
  buys nothing here and costs a class of bug that is expensive to recognise:
  editing a package and testing a stale `dist`. Both consumers already compile
  TypeScript — Metro natively, Next through `transpilePackages`.
- **`next-forge`'s `@repo/*` Turborepo layout.** ADR 0001 specifies a different
  shape on purpose: shared logic, types and tokens, but no shared UI.

## Consequences

**Versions are pinned once, in `pnpm-workspace.yaml`.** Shared dependencies are
declared in the `catalog:` block and referenced by name from each workspace, so
the web app, the native app and the packages cannot drift onto different copies
of TypeScript, Zod or the pg driver — the failure mode a monorepo exists to
prevent, and the one that makes native builds fail obscurely.

**A new consumer of a package has to be told to transpile it.** For the web app
that is one entry in `next.config.ts`. Anything that bundles a package without
a TypeScript loader will fail loudly at build time, not subtly at runtime.

**ADR 0001's import boundary is enforced twice, for free.** pnpm installs
isolated `node_modules`, so a package that does not declare `react-native` as a
dependency cannot resolve it — the typecheck fails outright. ESLint's
`no-restricted-imports` then exists to turn that into a sentence explaining
why, rather than a missing-module error.

Revisit when a third app or a real CI matrix arrives, or when a package needs
to be published outside the repo.
