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
the Chart Compiler. Movement is unknown, not zero, when Waveger does not hold
the previous Chart Week.
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
The Songs a player may name in a given Gameweek — the full Top 100 of the most
recently published Chart Week, not just the Top 40.
_Avoid_: candidates, eligible songs, the board

**Slip**:
One player's entry for one Gameweek: the set of Calls they submit before Lock.
_Avoid_: entry, ticket, prediction set

**Call**:
A single claim within a Slip about how the next Chart Week will differ from the
current one — always about movement, entry or exit, never about mere presence.
_Avoid_: prediction, guess, bet, pick

**Banker**:
The one Call in a Slip a player nominates to score double.
_Avoid_: captain, boost, multiplier

**Squad**:
A set of Songs a player holds across a Season under a budget, scoring each
Gameweek. Distinct from a Slip, which is per-Gameweek and holds nothing.
_Avoid_: team, roster, lineup

**League**:
A group of players ranked against one another. Either global or private to an
invited group.
_Avoid_: group, club, mini-league

**Provisional Standings**:
A Leaderboard computed from a mid-week chart update rather than a published
Chart Week. Always superseded, never a Settlement.
_Avoid_: live scores, running total, projected standings
