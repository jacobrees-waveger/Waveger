# Waveger

A music charts product with a fantasy-sports-style game played on top of it.
Waveger consumes externally published charts; it never compiles its own.

## Language

### Charts

**Chart**:
An externally compiled ranking of Songs, published on a fixed weekly cadence.
_Avoid_: leaderboard, ranking, top 40

**Chart Compiler**:
The organisation that compiles and publishes a Chart, and whose rules govern
what may appear on it.
_Avoid_: chart provider, data source, chart authority

**Chart Week**:
One published edition of a Chart, covering one fixed tracking period. The
product's fundamental clock — every other period is defined in terms of it.
_Avoid_: week, chart date, chart run

**Held**:
A Chart Week that is in Waveger's own archive, with every Entry on it. An
attempt that fetched nothing, or fetched something that was refused, leaves the
Chart Week not Held — and being Held says nothing about whether it is correct.
_Avoid_: stored, saved, cached, ingested, have

**Span**:
The stretch of a Chart's cadence Waveger claims: from the earliest Chart Week it
has reached for, whether or not it got it, to the Chart Week due now. It reaches
forward to the week due rather than to the last one Held, so an archive nobody
is adding to is short by a visible amount rather than merely small.
_Avoid_: range, coverage, window, archive period

**Missing**:
A Chart Week inside the Span that is not Held. A hole in the cadence rather than
an absence of rows: 2026-07-24 unheld is Missing, and 1953-01-01 is not Missing
but outside the Span, because nothing ever claimed it. A week that was fetched
and refused is Missing like any other — being reached for is not having.
_Avoid_: absent, unfetched, behind, stale

**Entry**:
One row of one Chart in one Chart Week — a Song at a Position. An Entry is an
event in time and is distinct from the Song it names.
_Avoid_: chart position, chart row, placing, appearance

**Position**:
An Entry's rank within its Chart Week. Position 1 is the top.
_Avoid_: rank, place, number, spot

**Movement**:
How far an Entry's Position changed from the previous Chart Week. Waveger's
own figure, derived by comparing two Chart Weeks it holds and never read from
the Chart Compiler. Movement is unknown, not zero, when the previous Chart Week
is not Held.
_Avoid_: change, delta, trend, last week

**Debut**:
A Song's first Entry on a Chart — on this Chart Week and not the previous one.
Distinct from an Entry whose Movement is merely unknown.
_Avoid_: new entry, newcomer, fresh

**Exit**:
A Song on the previous Chart Week with no Entry on this one. An Exit is the
absence of an Entry and never has one of its own.
_Avoid_: drop-out, fell off, removed

**Song**:
A recording eligible to appear on a Chart.
_Avoid_: track, single, record, tune

**Artist**:
The act credited on a Song. Which credits count as the same Artist is
determined by the Chart Compiler's rules, not by Waveger.
_Avoid_: act, musician, band, performer

### Game

**Gameweek**:
One Chart Week as scored by the game. Exactly one Gameweek per Chart Week —
the game never invents a clock of its own.
_Avoid_: round, matchweek, turn

**Season**:
A fixed run of consecutive Gameweeks, after which standings reset.
_Avoid_: competition, tournament, series

**Leaderboard**:
The game's own standings — a ranking of players. Never used for a Chart.
_Avoid_: table, rankings, standings

**Lock**:
The moment a Gameweek stops accepting players' choices. Tied to the close of
the Chart Compiler's tracking period, never to the Chart's publication.
_Avoid_: deadline, cutoff, close

**Settlement**:
Determining a Gameweek's results from a Chart Week that has been published.
Settlement is a statement of what the results *are*, not an adjustment to what
they were, so repeating it changes nothing.
_Avoid_: scoring run, payout, resolution

**Pick Pool**:
What a player may choose from: the Artists a Squad may hold, or the Songs a Slip
may name. Drawn from the most recently published Chart Week and running its full
depth, not just the Top 40.
_Avoid_: candidates, eligible songs, the board

**Slip**:
One player's entry for one Gameweek: the set of Calls they submit before Lock.
_Avoid_: entry, ticket, prediction set

**Call**:
A single claim within a Slip about how the next Chart Week will differ from the
current one — always about movement, entry or exit, never about mere presence.
_Avoid_: prediction, guess, bet, pick

**Banker**:
The one thing a player nominates to score double — a Call in a Slip, or an
Artist in a Squad. One word covering both, because it is one idea.
_Avoid_: captain, boost, multiplier

**Squad**:
A set of Artists a player holds across a Season under a budget, scoring each
Gameweek. Artists and not Songs, because a Song exits within a Season while an
Artist persists, and because the Chart Compiler's three-per-Artist cap makes an
Artist a portfolio of Entries whose ceiling Waveger never has to impose.
Distinct from a Slip, which is per-Gameweek and holds nothing.
_Avoid_: team, roster, lineup

**Price**:
What one Artist costs against a Squad's budget. Set before a Season opens and
fixed until it closes, so a Season is the only thing that ever re-rates anyone.
An Artist who first charts mid-Season is priced on arrival and fixed from there.
_Avoid_: cost, value, valuation

**League**:
A group of players ranked against one another. Either global or private to an
invited group.
_Avoid_: group, club, mini-league

**Provisional Standings**:
A Leaderboard computed from a mid-week chart update rather than a published
Chart Week. Always superseded, never a Settlement.
_Avoid_: live scores, running total, projected standings
