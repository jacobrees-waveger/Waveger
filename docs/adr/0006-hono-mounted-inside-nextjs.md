# The API is a Hono app mounted inside the Next.js deployment

Both the web app and the native app call one API, written with Hono and mounted
at `app/api/[[...route]]/route.ts` in the Next.js deployment. Handlers take a
Web-standard `Request` and import nothing from `next/*`.

## Why not a standalone service

The original argument for a separate deployment was that the native app should
not be a client of the website — a web deploy could break a shipped binary that
cannot be recalled quickly. That concern is real but **hosting topology does not
fix it**: deploy coupling is the generic shipped-client problem and a standalone
service suffers it identically. The cure is contract discipline — a versioned
route namespace and additive-only evolution.

Mounting therefore costs nothing operationally (one deployment, one log stream,
one set of environment variables while the team is one person) and preserves the
exit: moving to a separate deployment later is an adapter swap, not a rewrite.

## Why not plain Next.js route handlers

**Server Actions cannot serve a native client at all** — their IDs are
regenerated on every build by design, so a shipped binary breaks on the next web
deploy. Route handlers would work, but Hono keeps the business logic in
Web-standard handlers with no framework coupling, which is what makes the exit
cheap.

## Consequences

From the first commit, because these are free now and expensive to retrofit:
Zod validation on every route, OpenAPI spec emission, and an `/api/v1/`
namespace.

Deliberately deferred until the first TestFlight build: generated API clients
and a CI breaking-change gate. Until a binary exists in the field that cannot be
recalled, those guard against a risk the project does not yet carry.
