# The schedule is a GET, and it names no Chart Week

Ingestion runs unattended from a Vercel cron entry that fires
`GET /api/internal/ingest/uk-singles` at 06:00 UTC on a Saturday. The Chart Week
is worked out by the route, not carried by the caller, and a Chart Week that is
already **Held** is not fetched again.

## Why a GET

Vercel Cron makes an HTTP **GET** to a fixed path on the production deployment.
That is the whole of the interface: no body, no method of its own, no headers
but the ones it sends itself. `POST /api/internal/ingest` — the route WAV-9
built, taking a Chart Week in its body — cannot be a cron target at all.

The alternatives were to give the schedule a caller of its own, or to make
ingestion a background worker. Both would have put the trigger somewhere other
than the API, and WAV-9 made ingestion an HTTP request precisely so that
ingesting and reading share one test seam. A second mechanism would have its own
failure modes and its own way of being tested, for a route that already exists.

So there are two triggers on one namespace, and they differ in exactly what
their callers can express:

| | |
|---|---|
| `GET /api/internal/ingest/{chart}` | the schedule. The Chart Week due now |
| `POST /api/internal/ingest` | a person. The Chart Week they name, and `refetch` |

A GET that writes is not something to do twice. It is here because the platform
offers nothing else, on a route outside the versioned contract (ADR 0011) whose
only callers are a cron entry and an operator.

## Why the route works out the week

A date in `vercel.json` is stale the week after it is written, so the cron entry
carries a Chart and the route asks what Chart Week that Chart owes today: the
most recent Friday, in `chart/schedule.ts`.

That the Chart publishes on a Friday is **verified rather than assumed**. The ADR
0002 run was made on Thursday 2026-08-06 with no date given — "the current week
only", by the actor's own input schema — and returned the week dated 2026-07-31,
the Friday before it.

**Saturday, not Friday**, because the Chart goes live on Friday *evening*. Vercel
invokes Hobby cron jobs anywhere inside the hour named, so a Friday morning entry
would ask for a week that does not exist yet, and one late enough on Friday to be
safe would be one hour of slack from being wrong. Saturday morning is a night's
margin for a job that runs once a week. Hobby also caps cron jobs at one run per
day; weekly is well inside that.

## Consequences

**A firing that arrives twice costs nothing.** Vercel says cron delivery is best
effort and may invoke the same scheduled run more than once. A Chart Week that is
Held is not fetched, so the second firing does no work, spends nothing, and does
not even write a run row: nothing happened, and a week that is Held is its own
explanation.

**Held means the Chart Week and its Entries, never a run row.** The distinction
is load-bearing rather than pedantic. A week that has only ever been *refused*
has runs and no Entries; were those runs taken as evidence, the schedule would
decline to fetch it, and the hole would be permanent — on an actor that fails
19% of the time (ADR 0002), that is not a hypothetical.

**Re-fetching a Held week has to be asked for**, as `refetch` on the POST, and
that is the only way to do it. A Chart Week can be Held and wrong, so repairing
one has to be possible; but the schedule fires every week against an actor
charging $0.20 a fetch, so it cannot be the default. Making the override the
operator's word rather than a heuristic also means nothing can decide on its own
to spend the month's budget re-fetching the archive.

**A week the schedule misses stays missed until someone acts.** Vercel does not
retry a failed cron invocation, and the next firing is for the next week — so
after retries are exhausted (ADR 0014) the run is recorded as failed and the week
is simply absent. ADR 0012 makes that cost two weeks of movement rather than one.
Noticing it is WAV-17's job; repairing it is the POST.

**The cron entry lives in `apps/web/vercel.json`**, because Vercel's Root
Directory for this project is `apps/web` and that is where it reads its
configuration from. It is one of the few things about this deployment that *can*
live in a file — see the Deployment table in `README.md` for the two that cannot.
