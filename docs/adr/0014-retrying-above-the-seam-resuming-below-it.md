# Retrying happens above the ChartSource seam; resuming happens below it

A failed fetch is tried three times with a doubling backoff, by a loop that sits
above the `ChartSource` and knows nothing about where chart data comes from.
Between attempts it carries an opaque **resume cursor** out of the failure and
back into the next attempt, so a source that can continue a half-finished fetch
does, and one that cannot ignores it.

## Why retry at all

ADR 0002 measured the actor at 25 succeeded to 6 failed over thirty days — a 19%
failure rate — and the thirty days since have held: 27 to 6. A single failed
fetch would otherwise cost a Chart Week, and ADR 0012 makes a missing week cost
*two* weeks of movement, its own and its successor's. Vercel does not retry a
cron invocation either, so a week not fetched today is not attempted again until
next Saturday, by which time the schedule has moved on.

## Why the retry is above the seam and the resume is below it

The obvious place for both is inside the Apify implementation, where the actor's
`resumeCursor` already is. Splitting them buys two things.

**Every source is retried, including ones not written yet.** ADR 0002 keeps the
actor replaceable by putting one narrow seam in front of it. A retry policy
behind that seam would be part of the adapter, so a replacement would arrive with
no retries and nobody would notice until a week went missing.

**A policy behind the seam cannot be tested without the actor.** Retry, resume
and exhaustion are all driven through `app.request()` with a fake `ChartSource`
that fails on purpose — the same way every other behaviour in this package is
tested. The alternative was mocking HTTP inside the adapter, which tests the mock.

What stays below the seam is the only part that is actually about Apify. The
cursor is `Readonly<Record<string, unknown>>` to everything in between; the retry
loop moves it from a failed fetch to the next one without looking inside it. For
the actor it holds the `resumeCursor` from the failed run's `OUTPUT` record and
the datasets written so far, because a resumed run only writes what it had left
to do and the Chart Week is all of them stitched together.

## Considered options

- **Retry inside the Apify source.** Rejected above.
- **Retry the whole ingestion, not just the fetch.** Rejected. A week the source
  answered and the archive *refused* is not retried: the run finished, so there
  is nothing to resume, and a second run would pay $0.20 to be told the same
  thing. A half-scraped week is fixed by fetching again later, deliberately.
- **Retry on a queue, outside the request.** Rejected. It is a second mechanism
  with its own failure modes, and three attempts and two backoffs fit inside one
  function invocation with room to spare — 75 seconds for a run that takes six.
- **Exponential backoff with jitter.** Not done. Jitter spreads a thundering
  herd; there is one caller, once a week.

## Consequences

**Exhausted retries record a failed run and answer 502 — they never raise.** A
handler that threw would answer 500 from the app's error hook, and the schedule
would have nothing to show for it but a line in a log nobody reads. The recorded
failure carries the count (`the actor run failed (after 3 attempts)`), because an
operator reading `GET /api/internal/runs` needs to know whether that happened
once or three times.

**Resuming is worth little for a single week and a great deal for a backfill,
and it is built anyway.** One Chart Week is one page, so a failed run leaves one
unhandled request and resuming re-crawls it regardless. A date-range run is many
pages, and ADR 0002 puts the full archive at ~270,000 records — where paying
twice for what was already received is the difference between a $270 backfill
and an unbounded one.

This is worth being plain about, because on the requirement in front of us it
looks like generality bought on spec. It is not: ADR 0002 named the cursor as
the mitigation when it measured the failure rate, and WAV-11 asked for it in
those words. What tips it is that the alternative is not "no resume" but "resume
later" — and later means a source that has been running unattended for months
being reopened to add a code path nothing exercises, at the exact moment
somebody is spending hundreds of dollars through it.

**A run this has stopped waiting for is aborted.** Giving up on a run without
stopping it would leave it charging for records while the next attempt charges
for its own — the one failure that gets more expensive the harder it is retried.

**The whole retry budget has to fit inside one function invocation.** Three
attempts at 75 seconds plus 2s and 4s of backoff is 231 seconds. The ceiling is
300, and that was read off the project rather than assumed: `waveger` reports
`fluid: true` and `functionDefaultTimeout: 300`, and on Hobby 300s is both the
default and the maximum, so no `maxDuration` is set — there is no setting that
would buy more, and one written down could only ever lower it by accident.
Raising either number without doing that arithmetic buys a timeout instead of a
Chart Week. The run timeout is passed to the actor as well, so giving up and the
actor giving up are the same moment.
