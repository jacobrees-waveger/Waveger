# Calls are priced from historical base rates, not from the crowd

A Call's point value scales with how unlikely it was, and that likelihood is
computed from the chart archive — how often, historically, a Song at a given
position has made a given move. It is fixed and published before Lock.

## Considered options

**Crowd-derived pricing**, where a Call pays out in inverse proportion to how
many players made it, was rejected for two reasons. It is unusable at low
player counts, which is precisely the position Waveger launches from — with no
crowd there is no price. And it rewards being contrarian rather than being
right, which is the failure mode of ownership-differential scoring; no major
fantasy game uses it despite herding being their worst known problem.

**Flat points per question type** was rejected because it makes every Call
worth the same regardless of difficulty, which removes the judgement the game
is meant to test.

## Consequences

This is the main use for the archive backfill, and it means the scoring model
can be tuned and validated against decades of real chart weeks **before** any
user plays.

Base rates must be **frozen per Season** and versioned. Recomputing them
mid-Season would retroactively change what a Call was worth.
