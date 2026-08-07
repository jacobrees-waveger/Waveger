# The previous Chart Week is the one seven days back

Movement is derived against the Chart Week dated exactly seven days before this
one, and **not** against the most recent Held Chart Week older than it. When
Waveger does not hold that particular week, every Entry reports `unknown`
movement rather than movement measured across the gap.

## Why

A Chart publishes on a fixed weekly cadence, so "the previous Chart Week" is a
definite thing and not a search result. The Chart Week before 2026-07-31 is
2026-07-24 whether or not Waveger holds it.

The nearest-earlier reading is the obvious implementation and it is the one to
avoid, because ADR 0002 puts the actor at a 19% failure rate — a missing week is
expected, not exceptional. Ask for the nearest earlier Held week and a Song that
climbed three places a week for two weeks reports as a single six-place climb,
attributed to a week in which it did not happen. Nothing distinguishes that
number from a real one at any layer above.

The two failures are not symmetrical, and that asymmetry is the whole decision:

- **Wrong is permanent.** A movement figure derived across a gap is indistinguishable from a correct one, so nothing ever flags it and nobody goes looking.
- **Absent is recoverable.** `unknown` is visibly a non-answer. Nothing is denormalised and there is no movement column, so ingesting the missing week makes the correct movement appear on the next read, with no reprocessing step.

Under-reporting what we know is cheap here. Over-reporting is not.

## Considered options

- **The most recent Held Chart Week older than this one.** Rejected above. Its
  appeal is that it never returns `unknown`, which is precisely the problem.
- **Read the actor's `last_week`.** Rejected by ADR 0002: it is null for every
  descending Entry, so it gives the direction of a fall and never its magnitude.
- **Store movement at ingestion.** Rejected: correcting or backfilling a past
  Chart Week would then need a reprocessing pass over its neighbour, and a
  reprocessing step that can be forgotten will be.

## Consequences

**A missing Chart Week costs two weeks of movement**, not one: its own, and its
successor's, which has no predecessor to measure against. That doubles the value
of noticing gaps quickly, which is what WAV-17 is for, and it is the strongest
argument for backfilling the archive contiguously rather than in islands.

**Scoring rests on this.** ADR 0003 scores Calls on how the Chart reorders, so
this definition decides what players are scored against. It is cheap to change
today and expensive once a Season has been settled under it — changing the
definition later would move historical results.

**The weekly cadence is hardcoded**, as one named constant in
`packages/api/src/chart/movement.ts`. A second Chart on a different cadence
would move it onto the `chart` row, which is an additive change to a table that
already carries the Chart's own `position_count` for the same reason.
