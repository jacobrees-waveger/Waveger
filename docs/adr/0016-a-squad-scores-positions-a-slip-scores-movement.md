# A Squad scores Positions, a Slip scores movement

ADR 0003 says Waveger scores how the Chart reorders and never which Songs
appear on it. That stands for **Slips**. It does not govern **Squads**, which
score an Artist's Positions on a published Chart Week.

## Why 0003 does not reach this far

0003's argument is about *prediction*. A player asked "will this Song chart?"
is answering a question a prediction market already prices at 98%, so the game
becomes a lookup. Everything 0003 cites — rank-turbulence divergence of 0.09,
rank-movement entropy of 0.82 — is about how little a Chart Week's *membership*
tells you.

A Squad is not a prediction. It is an allocation under scarcity: a fixed budget
against published prices, where the skill is in judging whether an Artist is
worth what they cost. Nobody is asked what will happen.

The two claims are also both true at once, and measured to be
(`docs/research/squad-viability.md`): **Chart Weeks are turbulent in ordering
while Artists are stable in aggregate over a quarter.** Artist points correlate
at r = 0.72 between consecutive 13-week windows. A Slip rides the weekly
turbulence 0003 describes; a Squad rides the quarterly stability underneath it.
Neither game is available at the other's timescale.

## Why an Artist rather than a Song

Measured over 104 Chart Weeks:

- A Song exits within a Season and an Artist does not. 14–15 of any window's
  top 15 Artists are still scoring the next window, so a Squad does not rot to
  nothing the way a Squad of Songs would.
- The Chart Compiler's three-per-Artist cap makes an Artist a portfolio: 23% of
  artist-weeks hold more than one Entry and 11% hold the full three. The cap
  held **exactly** across all 10,400 Entries, so the ceiling is enforced by the
  Compiler and never by Waveger.
- Identity is the Compiler's, exactly as `CONTEXT.md` requires. Every row
  carries a lead-artist id, present on 100% of Entries, and 19 of 622 ids span
  more than one credit string — the Compiler merging collaborations for us. No
  credit-string parsing is required or wanted.

## Consequences

The game is measured to work before it is built. A squad picked on past form
beats 99% of random affordable squads, so research is rewarded; it captures only
40–56% of the hindsight ceiling, so most of the prize is still contested; and
consecutive hindsight-optimal squads share 0–1 Artists of 15, so no dominant
squad exists. The Fantasy Movie League failure mode ADR 0003 warns about does
not appear.

Two things follow that are not obviously good:

**The weekly decision is weak.** There are no injuries, suspensions or rotation
here, and squads do not rot. The pressure that makes a Fantasy Premier League
manager act every week largely does not exist, so a free weekly transfer is a
much thinner hook than the analogy suggests. What carries weekly engagement is
unresolved and is not answered by this ADR.

**Genre charts are not a set.** They must be admitted one at a time. Measured
over 52 weeks, Dance (r = 0.69) and Hip Hop & R&B (r = 0.53) behave like real
scoring surfaces. Rock & Metal does not: r = 0.98 and 38 distinct Artists in a
year, which is the same records in nearly the same order every week. Quota slots
on a chart that static are a tax every player pays identically, not a
trade-off.

The Slip keeps its vocabulary — Call, base-rate pricing, Pick Pool — unchanged,
and nothing here has been measured about it.
