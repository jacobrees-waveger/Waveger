# Waveger

A music charts product with a fantasy-sports-style game played on top of it.
Waveger consumes externally published charts; it never compiles its own.

`CONTEXT.md` holds the domain language. `docs/adr/` holds the decisions —
several of them deliberately reject the obvious option, so read them before
proposing an alternative.

## Setup

```bash
./scripts/setup.sh
```

An interactive wizard: it checks your toolchain, signs you in to Vercel, links
this checkout to the `waveger` project, pulls the environment, installs, runs
the migrations, and finishes by running the test suite.

If you would rather do it by hand:

```bash
vercel env pull .env.local   # never hand-write these — see .env.example
pnpm install
pnpm db:migrate
```

## Running it

```bash
pnpm dev            # the web app on http://localhost:3000
pnpm dev:native     # Metro; press i for the iOS simulator
pnpm test           # the suite, against a real Postgres
pnpm typecheck      # every workspace
pnpm lint           # including the shared-package import boundary
pnpm openapi        # re-emit packages/api/openapi.json from the routes
```

In an Orca worktree, `orca.yaml` has already assigned this checkout its own
ports, in `apps/web/.env` and `apps/native/.env`. The two commands above pick
them up with no flags — which matters, because a Metro bundler on someone
else's port serves you their code with no error anywhere.

## Layout

```
apps/
  web/         Next.js, App Router. Also hosts the API (ADR 0006).
  native/      Expo, React Native, Expo Router.
packages/
  domain/      Shared types. Today that is the API contract, as Zod schemas.
  db/          Kysely, the SQL migrations, and the migration runner (ADR 0004).
  api/         The Hono app. Knows nothing about Next.js.
  api-client/  What both apps call the API through.
```

Both apps are first-class and screens are written twice, on purpose (ADR 0001).
`packages/` is shared logic, types and tokens — never UI. That boundary is
enforced, not trusted: the packages do not declare React, React Native, Next or
Expo as dependencies, so pnpm's isolated installs make those imports
unresolvable, and ESLint explains why when you try.

## The API

One versioned API under `/api/v1`, written with Hono and mounted inside the
Next.js deployment (ADR 0006). Handlers take a Web-standard `Request` and
import nothing from `next/*`, so moving the API to its own deployment later is
a swap of `apps/web/src/app/api/[[...route]]/route.ts`, not a rewrite.

- `GET /api/v1/status` — service, database reachability, applied migrations
- `GET /api/v1/openapi.json` — the OpenAPI 3.1 document, generated from the
  same Zod schemas the routes validate against

`packages/api/openapi.json` is committed so a contract change shows up as a
diff in review. A test fails if it drifts from what the routes generate; run
`pnpm openapi` to update it.

## Database

Postgres on Neon, in London, provisioned through the Vercel Marketplace
(ADR 0008). Two connection strings, and mixing them up fails intermittently
under load rather than immediately:

- `DATABASE_URL` — pooled. What the app uses.
- `DATABASE_URL_UNPOOLED` — direct. What migrations and tests use.

Migrations are hand-written SQL in `packages/db/migrations/`, applied in
filename order and recorded in `schema_migration` — a table which is itself the
first migration, so every table in the database was put there by a file you can
read. There is no `down`: this project removes obsolete paths rather than
reversing into them. Adding a migration means editing `packages/db/src/schema.ts`
in the same commit — that file is the hand-written record of what the SQL
produced, and nothing generates it.

## Tests

`pnpm test` drives the real Hono app with `app.request()` against a real
Postgres. Nothing is mocked. Each test gets a fresh schema, migrated from the
same SQL a deployment runs and dropped afterwards, so tests cannot see each
other's rows and none of them clean up after themselves.

## Deployment

Vercel project `waveger`, team `jacobreesnew-7380s-projects`, deploying from
`jacobrees-waveger/Waveger`. Two project settings carry the monorepo, and
neither can live in a file:

| Setting | Value |
|---|---|
| Root Directory | `apps/web` |
| Framework Preset | Next.js |

`apps/web` is the deployable, so Vercel points at it directly and detects Next
from `apps/web/package.json`. Install still resolves from the workspace root —
the build log reads `Scope: all 7 workspace projects` — so `packages/*` are
linked as sources and compiled by Next, exactly as ADR 0010 intends.

Root Directory is a project-level setting, so `vercel.json` cannot express it.
That makes this table the only record, which is why it is written down rather
than left in the dashboard. Getting it wrong does not fail loudly: pointed at
the repository root, Vercel detects no framework, falls back to a static build,
runs `pnpm build` successfully, then fails with `No Output Directory named
"public" found` — a passing build and a dead deployment.
