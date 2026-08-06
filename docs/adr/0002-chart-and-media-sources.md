# Chart positions and song media come from different sources

Chart positions come from an Apify actor scraping the UK Official Singles
Chart; artwork, previews and catalogue metadata come from the Apple Music API.
No single provider does both well, so we split the roles and join the two on
artist and title strings.

## Why the UK chart

Its **rules** make a better game than any alternative. It caps an artist at
three songs in the Top 100, so no single release can swamp the Pick Pool. It
has no recurrent rule, so a Song fades in value rather than vanishing without
warning. And its rulebook is published and numbered, so any score can be
justified by citing a clause.

## Considered options

- **Apple Music charts.** Free, keyless, official — but it is Apple's own
  play ranking, not a chart. No per-artist cap (one artist held 15 of 100
  positions on the day we checked), no published methodology, and **no date
  parameter anywhere**, so no history exists and none can be backfilled.
- **A licensed feed** (Official Charts Company, or Billboard via Luminate).
  Not pursued.
- **RapidAPI.** Its single UK listing has been broken since 2023 and has no
  date parameter. The Billboard listings are rated 2.4–2.8 out of 5.

## Consequences

The Apify actor is **load-bearing and unproven** — five users, no reviews.
Three mitigations, all cheap:

1. **Own every row.** Persist each Chart Week to our own Postgres on arrival.
   If the actor disappears we keep the whole archive and lose only future
   weeks.
2. **Backfill early.** Buying the archive converts the dependency risk into a
   one-off purchase — and the history is a product feature, not just backtest
   data. See the corrected costing below before acting on this.
3. **One narrow seam.** All chart access goes through a single `ChartSource`
   interface so a replacement is an adapter, not a rewrite.

The Apify payload carries **no ISRC**, so joining a chart row to Apple's
catalogue is string matching on artist and title, which fails on featured
credits, remixes and title suffixes. Chart rows are therefore the source of
truth: the Apple catalogue ID is a nullable resolution step with a
manual-override table, and **a failed join must never block Settlement**.

## Verified against a live run, 2026-08-06

One run of the chart dated 2026-07-31 returned all 100 positions with no gaps
or duplicates. Ranks, titles, artists, `peak_position`, `weeks_on_chart` and
`is_new` all check out, and the three-per-artist cap holds exactly. Two defects
found:

- **`last_week` is null for every descending entry** — 41 of 41, no exceptions,
  while all 37 climbers and 11 non-movers carry it. So the *direction* of a
  fall is reported but its *magnitude* is not.
- **`label` is always empty**, as the actor's own schema admits.

**Derive `last_week` ourselves** by self-joining the previous Chart Week rather
than reading the field. Owning the archive makes this free, and it is the only
way falls are scoreable at all. Treat the actor's `last_week` as unused.

Observed reliability over the preceding 30 days was 25 succeeded to 6 failed —
a **19% failure rate** — so ingestion needs retries, and the actor's
`resumeCursor` avoids paying twice for records already received.

## Backfill costing, corrected 2026-08-06

An earlier draft of this ADR put the full archive at "roughly $65 once". That
is wrong by roughly 4–10x, and the error mattered enough to record rather than
silently fix.

The actor is **pay-per-event**, verified against the account's own run history:

```
Actor Start      $0.10  per run
Record scraped   $0.001 per record
```

The one verification run cost exactly $0.20 — one start plus 100 records —
which confirms the model.

The chart runs weekly from 1952, so the full archive is roughly 3,850 chart
weeks. Chart size grew over time (Top 12 in 1952, Top 50 by the 1960s, Top 75
from 1978, Top 100 from 1994), averaging perhaps 70 positions:

| Slice | Records | Cost |
|---|---|---|
| Full archive, 1952 to now | ~270,000 | **~$270** |
| Top 100 era, 1994 to now | ~165,000 | **~$165** |
| ~12 years, 2013 to now | ~65,000 | **~$65** |

The original $65 corresponds to about 65,000 records — roughly twelve years,
not seventy-four. It was a Top-100-era slice described as the whole archive.

Three things make the real cost controllable:

- **A single run walks a date range.** `startDate`/`endDate` fetch many weeks in
  one run, so actor-start cost is $0.10 total, not $0.10 per week. Per-week runs
  would have added ~$385 to the full archive.
- **`charts` defaults to `["singles-chart", "albums-chart"]`.** Waveger needs
  only singles. Leaving the default doubles the bill for data we discard.
- **`maxItems` is a hard spend cap.** At $0.001 per record it converts directly
  to money: `maxItems: 65000` is $65, whatever the date range says.

**Two constraints on when to buy.** The account is on Apify's Free plan, which
caps spend at $5/month — a paid month (Starter, $29, includes $29 of credit) is
required, after which downgrading is free and the data stays ours. And Free-plan
**data retention is 7 days**, so a backfill run must land somewhere permanent
before any downgrade. Steady-state weekly ingestion is ~$0.20/week and fits
inside the Free tier indefinitely, so this is a one-off cost, not a subscription.

**Sequencing.** Do not buy before there is somewhere to put it. The backfill
should follow the ingestion path being built, so records go straight to our own
Postgres per mitigation 1 — otherwise they sit in an Apify dataset on a
seven-day clock.
