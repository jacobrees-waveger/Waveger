# Artist prices are set once and never move

An Artist's Price is derived from the previous Season's Positions, on a concave
curve, and is fixed for the whole Season. An Artist entering the Pick Pool
mid-Season is priced on entry and then fixed like every other. No Price ever
changes while a Season is running.

## Why not the crowd

Fantasy Premier League moves prices daily with net transfers. ADR 0005 already
rejected crowd-derived pricing for Calls, and both of its reasons apply here
unchanged: it is unusable at the low player counts Waveger launches from, and it
rewards being contrarian rather than being right.

ADR 0005 also requires base rates frozen per Season and versioned, because
recomputing mid-Season retroactively changes what something was worth. A Price
is the same kind of fact. With 13-week Seasons this still yields price movement
four times a year, which is the FPL feel without the crowd.

Frozen Prices also remove the sell-on-profit mechanic entirely. That is a
simplification taken deliberately, not an omission.

## Why concave

Measured across seven consecutive 13-week window pairs
(`docs/research/squad-viability.md`), pricing 15 slots against 100 coins:

| Curve | Beats random | Ceiling captured | Top 3 picks' share of spend | Artists over 10 coins |
|---|---|---|---|---|
| Concave | 99% | 48% | 44% | 19 |
| Linear | 94% | 43% | 37% | 7 |
| Convex | 100% | 61% | 28% | 4 |

**Convex is the worst game.** It compresses the top of the market, so elite
Artists are cheap relative to what they score, buying them is obvious, and 61%
ceiling capture puts it closest to solved.

Concave makes elite Artists genuinely expensive — the top three picks eat 44% of
the budget — while leaving 52% of the achievable points unreached. Linear is a
defensible alternative that trades skill signal for headroom.

The budget must bind, and does: an unconstrained top 15 costs 177–196 coins
against 100 in every window measured.

## Why the Pick Pool stays open

Consecutive hindsight-optimal squads share 0–1 Artists of 15. The ceiling is
reached almost entirely through **breakouts** — Artists priced cheaply on last
Season's form who then climb. Freezing the Pick Pool at Season start would make
those unbuyable and put the whole 52% headroom out of reach, which is precisely
what keeps the game live past its opening weeks.

So the Pool is open and a new Artist is priced when they first chart. Their
Price is then fixed for the remainder of the Season like everyone else's, so no
existing Price is ever reopened.

## Consequences

Prices are a **published, versioned artefact per Season**, derived and frozen
before it opens, exactly as ADR 0005 requires of base rates. A Season boundary
is the only moment the market re-rates anyone.

An Artist with no previous-Season Positions has no derived Price, so the pricing
rule for a first-time entrant is the one case this does not settle.

Because Prices never move, a Squad's value is constant and a player's budget
does not grow. Any future mechanic that rewards good buying has to pay in
points, not in coins.
