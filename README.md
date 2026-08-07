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
- `GET /api/v1/chart-weeks/latest` — the most recently held Chart Week, ranked
  from Position 1 down. Answers 404 `no_chart_week` when the archive is empty,
  which both apps say out loud rather than rendering nothing
- `GET /api/v1/openapi.json` — the OpenAPI 3.1 document, generated from the
  same Zod schemas the routes validate against

`packages/api/openapi.json` is committed so a contract change shows up as a
diff in review. A test fails if it drifts from what the routes generate; run
`pnpm openapi` to update it.

Three more routes sit under `/api/internal` and are deliberately **absent** from
that document (ADR 0011). They serve the operator, promise nothing to any
client, and are free to change — they are validated like everything else, but
nothing in the field calls them, so nothing is promised.

- `GET /api/internal/ingest/{chart}` — the Chart Week due now. What the schedule
  fires, and a GET because that is all Vercel Cron sends (ADR 0013)
- `POST /api/internal/ingest` — `{"chart": "uk-singles", "date": "2026-07-31"}`,
  optionally `"refetch": true` to fetch a week the archive already holds
- `GET /api/internal/runs?chart=…&date=…` — what happened when it ran

All three need the shared secret, as `Authorization: Bearer $CRON_SECRET`. Absent
from the OpenAPI document is not a security measure — it is one guessable path
— and these routes write to the archive, so the secret is what actually closes
them. A deployment that has no `CRON_SECRET` answers 503 on both rather than
serving them: a secret nobody set is not a secret everybody passes. The public
`/api/v1` is unaffected either way.

`Authorization: Bearer` is the scheme because it is what Vercel Cron sends by
itself when `CRON_SECRET` is set, so ingestion runs on a schedule with a cron
entry and no caller code of its own.

```bash
# The Chart Week the schedule missed, fetched by hand.
curl -X POST "$WAVEGER_URL/api/internal/ingest" \
  -H "authorization: Bearer $CRON_SECRET" \
  -H 'content-type: application/json' \
  -d '{"chart":"uk-singles","date":"2026-07-31"}'
```

## Charts

Waveger consumes the UK Official Singles Chart and never compiles its own. All
chart data enters through one `ChartSource` (ADR 0002), so replacing where it
comes from is an adapter and not a rewrite. That implementation is an Apify
actor scraping the Official Charts site, and everything that knows the actor
exists is inside `packages/api/src/chart/apify-source.ts` — one file, needing
`APIFY_TOKEN`. Tests replay two runs of it kept verbatim in
`packages/api/src/chart/fixtures/`.

It runs **on a schedule**: a Vercel cron entry fires
`GET /api/internal/ingest/uk-singles` at 06:00 UTC each Saturday, and the route
works out which Chart Week that is — the most recent Friday. A GET because that
is the only request Vercel Cron makes, and Saturday because the Chart goes live
on Friday evening (ADR 0013).

The actor fails about one run in five, so a failed fetch is **tried three times**
with a doubling backoff, each attempt resuming where the last stopped rather than
paying again for records already received. When all three fail the run is
recorded as failed and the schedule carries on (ADR 0014). A Chart Week the
archive already holds is not fetched at all — Held means the week *and its
Entries*, never merely that a run happened — and `"refetch": true` on the POST is
the only way to fetch one again.

Ingestion fetches a Chart Week, judges it **whole**, and only then persists it.
A week is refused unless it has exactly the Chart's Position count, contiguous
from 1, with no duplicate Positions and no missing titles or Artists — because
the dangerous failure of a 19%-failure-rate scraper is not the run that errors,
it is the one that returns 87 of 100 Positions and looks like a chart. A refused
week leaves the archive untouched and is recorded as a failed run, with its
payload kept so it can be replayed without paying to fetch it again.

An Artist over the Chart Compiler's three-per-week cap is **flagged, not
rejected**. A breach of the Compiler's own rules is evidence about the source,
not something for Waveger to correct.

Re-running ingestion for a week already held leaves the archive in the same
state. A Song is identified by a conservative normalised fingerprint of Artist
and title — case, whitespace and punctuation only, because merging two Songs
cannot be undone once Entries point at the merged one, while splitting one is
visible and fixable.

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

The archive itself is Charts, Chart Weeks, Songs, Entries and a log of every
ingestion run. Entries are keyed on Chart Week and Position, which is what makes
duplicate Positions impossible to persist and re-ingestion an upsert. There is
no movement column: movement is derived at read time by self-joining the
previous Chart Week, so correcting a past week fixes its neighbours with no
reprocessing step.

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
