# A migration must be compatible with the code already serving

The schema and the running code change at different moments, and both moments
have traffic in them. So the rule is one invariant rather than a taxonomy of
migrations: **whichever of the two changes first must work against the other's
old state.**

Today migrations are applied by hand after the deploy (WAV-25), so the code
changes first. That makes the working form of the invariant: **a migration never
ships in the same PR as the code that depends on it.** The code lands, serves
against the old schema, and only then is the schema applied.

## Why

Vercel builds `main` as Production on push and nothing in the build runs
`pnpm db:migrate`. Every landing therefore deploys code first and applies schema
second, with a human in between. That is not a choice made per PR; it is the
only order this repo can produce. A PR carrying both a migration and the code
that uses it is therefore *guaranteed* to run that code against the old schema
until someone migrates — not at risk of it, guaranteed, by construction.

WAV-17 landed exactly that. `0003` replaced a two-value check constraint with a
three-value one and rewrote the rows, in the same PR as the code writing the new
values. Between merge and migration, production ran code writing `rejected` and
`unavailable` into a table admitting only `succeeded` and `failed`. Nothing went
wrong, because the only automatic writer is a weekly cron that happened to be a
day away. The landing was correct by calendar rather than by construction, and
removing the calendar from that sentence is the whole point of this ADR.

## Why not a list of safe migration types

The tempting shortcut is "additive changes are safe, narrowing ones are not."
It is wrong, and wrong in the direction that bites: a `not null` column with no
default, or a new unique index, is additive by any reasonable reading and breaks
the *already serving* code the instant it is applied — `23502` and `23505`
respectively. Meanwhile a widening constraint is safe in both directions.

"Additive" describes the SQL. The invariant is about the **code**, and only the
code can answer it. Ask of every migration: *does the version currently serving
survive this?* If not, it needs a compatible intermediate — the widening half of
expand and contract — regardless of which SQL keyword it uses.

## What follows, while migrations are manual

Because the code changes first, new code must tolerate the old schema:

- **A migration and the code that needs it are separate PRs**, migration second.
  The code PR must work without the new schema, or it waits.
- **A change the serving code cannot survive needs an intermediate step**:
  expand, then code, then contract. Three PRs, and the contract only once
  nothing writes the old shape.

## When this changes

The trigger is **not** "WAV-25 lands" — that ticket asks where migrations should
run, and a post-deploy hook would satisfy its title while leaving this exactly
as it is. The trigger is the property: *migrations applied before the new
version serves.*

If that becomes true, the schema changes first and the invariant flips. New code
no longer has to tolerate the old schema, so the separation rule stops earning
its keep for changes the serving code survives. What does **not** change is the
requirement itself: a migration applied while the previous version is still
serving must be compatible with it, which is expand and contract, permanently.
One database and more than one live version of the code is a fact no pipeline
removes.

## The tension with the engineering principles

`CLAUDE.md` says: *"Do not preserve backward compatibility. Remove obsolete
paths instead of adding compatibility layers, fallbacks, or migrations."* An
expand step is, read literally, a compatibility layer.

The principle is about what the codebase **carries permanently** — a v1 endpoint
alive for shipped binaries, a fallback nobody can delete. Nothing here is
permanent, because the contract step removes the widening.

The risk is that the contract step is forgotten, at which point it *is*
permanent and the principle has been broken by neglect. That is ADR 0012's
argument against a movement column: "a reprocessing step that can be forgotten
will be." So the mitigation is not discipline. **The expand PR files the
contract ticket before it merges.**

## Considered options

- **One PR, with the ordering reasoned about each time.** What WAV-17 did.
  Rejected: it makes each landing's safety depend on knowing what writes to a
  table during the gap — answered correctly right up until it is not, and asked
  at the least reliable moment, the end of a long session with a green PR in
  front of you.
- **Applying migrations in the deploy pipeline.** WAV-25, and open rather than
  decided: a build is not a deploy, and a build failing after its migration has
  run leaves the schema ahead of the code with no deployment behind it. Whatever
  it settles on, the section above says which half of this ADR survives.
- **A staging environment between branch and production.** Disproportionate for
  a solo project on Vercel Hobby, where previews already get their own Neon
  branch (ADR 0008).

## Consequences

**A schema change costs at least two PRs.** A vertical tracer-bullet ticket
(`/to-tickets`) naturally produces one PR carrying a migration and its code
together, and this splits it. That cost is real and is the reason WAV-25 exists.

**`0003` stays as it is.** Applied, gap closed, production consistent.
Rewriting a landed migration to match an ADR written after it would be a second
mistake for the sake of the first.

**`/review-pr` checks the PR's file list before asking to merge**, and asks for
the contract ticket when a migration is a widening.
