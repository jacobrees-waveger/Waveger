# Postgres is Neon, provisioned through the Vercel Marketplace

Postgres is hosted on Neon in the London region (`lhr1`), created as a Vercel
Marketplace resource on the `waveger` project rather than as a standalone Neon
project. ADR 0006 puts the API inside the Next.js deployment, so every query
runs from a serverless function — which makes connection pooling a hosting
requirement rather than a tuning exercise, and makes a database that scales to
zero a better fit than one billed for an always-on instance holding almost
nothing.

## Considered options

- **Supabase.** ADR 0007 already declined Supabase Auth to keep user records
  ours. Taking Supabase purely as a Postgres host means running a platform
  whose main draw is the parts we turned down.
- **A standalone Neon project.** Same engine, but the connection strings become
  ours to copy, paste and keep in sync across environments. The Marketplace
  route injects them instead.
- **A conventional managed Postgres** (RDS, Railway, Fly). All bill for an
  always-on instance, none branch, and each needs a pooler bolted on before it
  is safe behind serverless functions.

## Consequences

**Connection strings are injected, not managed.** The integration sets sixteen
variables on the project across Production, Preview and Development. Two matter:

- `DATABASE_URL` — pooled (`-pooler` host). What the app uses.
- `DATABASE_URL_UNPOOLED` — direct. What migrations and any long-lived session
  must use.

Locally they arrive via `vercel env pull .env.local`. Nothing is hand-copied,
which removes the failure mode where the two get swapped — a mistake that
surfaces as intermittent failures under load rather than an immediate error.

**Preview deployments get their own database branch.** Branch-per-deployment is
enabled for Preview and deliberately off for Production. This is the reason the
Marketplace route is worth recording: a Neon branch is a full copy-on-write
database with its own connection string, which is what makes WAV-8's per-test
isolation and one-worktree-per-ticket affordable rather than a shared database
everyone races on.

**`DATABASE_URL` is not marked sensitive.** Including the Development
environment forbids it — `vercel env pull` has to read the value back, so Vercel
will not let it be write-only. The value is therefore readable in the Vercel
dashboard by anyone with project access.

**Neon Auth is off.** The integration offers built-in auth with user profiles
synced to Postgres, on by default. It is the vendor-held user table ADR 0007
rejected, and enabling it would quietly reopen that decision.

Lock-in is modest: this is real Postgres, so the exit is a dump and restore.
The branching workflow is the part that would not survive the move.
