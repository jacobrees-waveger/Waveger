# Operator routes live outside the versioned contract

Ingestion and its run log are served from `/api/internal`, not `/api/v1`, and
they are **absent from the OpenAPI document**. The public API keeps every
promise ADR 0006 makes for it; these routes make none.

## Why

ADR 0006 says "from the first commit … Zod validation on every route, OpenAPI
spec emission, and an `/api/v1/` namespace", and it is worth being explicit that
this narrows the second of those three rather than quietly ignoring it.

The reason those three exist is a shipped native binary that cannot be recalled.
`/api/v1` only ever grows because something in the field parses it months after
it was built. Nothing in the field calls ingestion. Its only callers are a cron
target and a person repairing a week the schedule missed, both of which are
deployed from this repository and change with it.

Publishing it would therefore promise permanence to no one, at a real cost:
every operator convenience would become a compatibility obligation, and the
document a client generates from would describe routes no client may call.
A contract that includes things nobody is allowed to use teaches readers to
ignore it.

Zod validation is **not** narrowed. Both operator routes validate their input,
and `POST /api/internal/ingest` is where the request-side half of that rule was
first exercised at all — a status endpoint has no honest input.

## Why under `/api` and not beside it

`/internal/…` would read better. It does not work: the whole Hono app reaches
the world through one Next.js catch-all at `app/api/[[...route]]/route.ts`, and
a second prefix needs a second route file. ADR 0006 makes that file the only
adapter between Hono and Next precisely so that moving the API out later is a
swap and not a rewrite. One more adapter is one more place to remember, in
exchange for a nicer path.

## Consequences

The boundary is now the thing to be careful about, because it is invisible in a
URL: `/api/v1/*` is the contract, `/api/internal/*` is not, and they differ by
one path segment. Anything a client needs belongs in `v1` even when an operator
also wants it.

These routes are **unauthenticated today**, which is only acceptable because
nothing is deployed to a public URL yet with data worth protecting. WAV-11 puts
a shared secret in front of them along with the schedule. Until then, do not
treat "not in the document" as "not reachable" — it is one guessable path.

`GET /api/internal/runs` exists partly so that "recorded as a failed run" is
observable through the API. The alternative was a test reading the
`ingestion_run` table, and asserting on rows a route cannot show you is the one
thing the testing decisions for this slice rule out. That is a legitimate reason
for a route to exist, but it is a reason to keep it *small*: it reports what
happened, not the payloads themselves.
