# Waveger

A music charts product with a fantasy-sports-style game played on top of it.
Waveger consumes externally published charts; it never compiles its own.

Read `CONTEXT.md` for the domain language and `docs/adr/` for the decisions —
several deliberately reject the obvious option. Tooling research lives in
`docs/research/`.

## Engineering principles

- Do not preserve backward compatibility. Remove obsolete paths instead of
  adding compatibility layers, fallbacks, or migrations.
- Choose the simplest implementation that fully meets the current
  requirements. Avoid speculative abstractions, configuration, and
  indirection.
- Grow the system in layers. Start from the smallest version that works end
  to end, and add each new capability on top of a product that already
  works. Never trade a working product for unfinished complexity.
- Keep components modular and concerns clearly separated.
- Prefer established, well-maintained libraries when they reduce overall
  complexity or improve reliability. Do not reimplement common
  functionality without a clear reason.
- Lean on the dependencies already in the project before writing your own
  implementation or adding packages. Do not assume a library lacks a
  capability without checking its documentation and types.
- Make architectural decisions for the long term. Do not accept a stopgap
  that only works for now and is meant to be replaced later.

## Stack

| | |
|---|---|
| Repo | Monorepo, two apps at equal priority, sharing domain types, scoring rules, the chart client and design tokens — **not** UI. Screens are written twice (ADR 0001) |
| Web | Next.js, App Router |
| Native | Expo, React Native on the New Architecture |
| API | Hono, mounted at `app/api/[[...route]]/route.ts` inside the Next.js deployment. Handlers take a Web-standard `Request` and import nothing from `next/*` (ADR 0006) |
| Database access | Kysely — a typed query builder, **not** an ORM (ADR 0004) |
| Database | Postgres. Host not yet chosen |
| Auth | Better Auth against our own Postgres — cookie sessions on web, bearer tokens on native (ADR 0007) |
| Chart positions | Apify actor scraping the UK Official Singles Chart (ADR 0002) |
| Song media | Apple Music API — artwork, previews, catalogue metadata. Joined to chart data on artist and title strings (ADR 0002) |
| Database host | Neon, London (`lhr1`), provisioned as a Vercel Marketplace resource. Preview deployments get their own database branch (ADR 0008) |
| Deployment | Vercel project `waveger`, team `jacobreesnew-7380s-projects`, deploying `jacobrees-waveger/Waveger` |
| Repo visibility | **Public** — Vercel Hobby will not deploy a private org repo, and the org is required for Linear sync (ADR 0009) |

## Agent skills

### Issue tracker

Issues live in **Linear**, team `Waveger` (`WAV-*`), reached through Orca's CLI:
`orca linear ... --workspace fb959783-b1df-489f-a228-87c38bed4271`. Orca is
connected to three Linear workspaces and does not infer one from the directory,
so **that flag is mandatory** — omitting it silently targets whichever workspace
Orca picks, and that changes without warning. There is deliberately no Linear MCP
server; don't add one.

`jacobrees-waveger/Waveger` is linked to that team with **two-way** issue sync,
so create issues in Linear only — filing on both sides makes an unreconcilable
duplicate pair. The repo sits in its own GitHub org on purpose: one GitHub owner
can bind to only one Linear workspace, so sharing an org with Sift would break
both. See `docs/agents/issue-tracker.md`.

### Triage labels

The five canonical role names verbatim — `needs-triage`, `needs-info`,
`ready-for-agent`, `ready-for-human`, `wontfix` — as workspace-level Linear
labels, with `bug`/`enhancement` mapping to `Bug`/`Feature`. Change them with
`orca linear label add` / `label remove`, never `label set`. See
`docs/agents/triage-labels.md`.

### Domain docs

Single-context: one `CONTEXT.md` and one `docs/adr/` at the repo root, both
created lazily. See `docs/agents/domain.md`.

## Which tool owns what

Several tools overlap here. Picking the wrong one wastes time.

| Job | Tool |
|---|---|
| Next.js, React, routing, caching, Turbopack | **`vercel` plugin skills** (`vercel:nextjs`, `vercel:react-best-practices`, …) |
| Expo, Expo Router, native UI, EAS builds and submission | **`expo` plugin skills** |
| Reanimated, Gesture Handler, SVG, JSI, worklets, RN threading | **`skills:react-native-best-practices`** (Software Mansion — they maintain those libraries) |
| Apple framework docs, Apple Music API, SwiftUI symbols | **`apple-docs` MCP** — *not* Context7, which is weak on Apple docs |
| Docs for everything else — Kysely, Hono, Better Auth, Apify | **`context7` MCP** |
| Issues, tickets, triage | **`orca linear ... --workspace <id>`** — see Issue tracker above |
| Taps, gestures, typing, hardware buttons on the iOS simulator | **`orca-emulator` skill** |
| Screenshots of the simulator | **Expo MCP** (`automation_take_screenshot`) — `orca-emulator` has **no** screenshot command, so an agent driving it alone is blind |
| Driving a browser against the web app | **Orca's embedded browser** (`orca goto`, `orca snapshot`, `orca click`, …) — worktree-scoped tabs |
| Web performance, Core Web Vitals, Lighthouse, heap, source-mapped traces | **`chrome-devtools-mcp`** — `orca console`/`orca network` are log tails, not traces |
| Desktop UI outside Orca — Xcode, Simulator.app, external browsers | **`computer-use` skill** |

Not yet installed, each waiting on a trigger: `next-devtools-mcp` and
`next-dev-loop` (Next.js scaffolded, 16+) for dev-server errors, routes and
single-route compiles; `metro-mcp` (Metro running) for the RN JS runtime —
symbolicated traces, network bodies, render profiling; the shadcn MCP (if
shadcn is adopted); `neon` (a real database); `sentry` **or** `eas-observe`,
never both, at the first shipped build.

## Settled decisions some skills will try to relitigate

Two installed skills default to options the ADRs deliberately rejected. Treat a
suggestion to use them as a proposal to reopen a closed decision, not as advice.

- **`vercel:auth`** covers Clerk, Descope and Auth0. ADR 0007 chose Better Auth
  precisely so user records stay in our database and the provider stays
  replaceable. Clerk and Supabase Auth both hold the user table.
- **`vercel:next-forge`** installs its own opinionated Turborepo `@repo/*`
  layout. ADR 0001 specifies a different shape on purpose — shared logic, no
  shared UI.

Likewise, don't reach for Supabase, Prisma or Drizzle: ADRs 0004 and 0007 rule
out all three.

## Local setup

Environment variables are **injected by Vercel**, not hand-written. Neon sets
sixteen of them on the project; two matter:

- `DATABASE_URL` — pooled (`-pooler` host). What the app uses.
- `DATABASE_URL_UNPOOLED` — direct. What migrations use. Running migrations on
  the pooled string fails intermittently under load rather than immediately.

```bash
vercel env pull .env.local     # both, plus the PG*/POSTGRES_* aliases
```

`.env.local` is gitignored. `.env.example` deliberately is **not** — it
documents the required variables and belongs in the repo.

## Worktrees

`orca.yaml` runs on every `orca worktree create`. It copies `.env`,
`.env.local`, `.claude/settings.local.json` and `.vercel/` from the primary
checkout — none of which travel with a git worktree — and assigns the worktree
its own web and Metro ports.

That last part is not a nicety. Metro hard-defaults to 8081 and Orca allocates
nothing, so without it a second worktree running `expo start` silently attaches
to the **first** worktree's bundler, and you test the wrong code with no error
anywhere. Start Expo with `pnpm expo start --port $RCT_METRO_PORT`.

Editing `orca.yaml` re-triggers Orca's trust dialog; the setup hook will not run
until it is accepted.

## Working practice

Features run through the engineering skills in a fixed order. All of them are
`disable-model-invocation` — **only the human can invoke them**, which is why
they do not appear in the model's skill list:

```
/grill-with-docs          interview to shared understanding; writes CONTEXT.md + ADRs
   ↓
/to-spec                  the conversation, synthesised into a spec on Linear
   ↓
/to-tickets               spec sliced into vertical tracer-bullet tickets
   ↓
/implement                one ticket, TDD at the agreed seams, then /code-review
```

Small work can skip from the grill straight to `/implement`. `/wayfinder`
replaces `/to-spec` when the shape is still foggy — it resolves unknown
*decisions* one at a time, where `to-spec` assumes you know what you are
building and are slicing *how*.

Run the grill and the implementation in separate sessions. The stated ceiling is
roughly 140K tokens before the model degrades, and the installed plugins already
spend ~9k of that before anything is typed.
