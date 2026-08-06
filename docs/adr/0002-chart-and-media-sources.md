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
2. **Backfill early.** The full archive back to 1952 costs roughly $65 once.
   Buying it in week one converts the dependency risk into a one-off purchase
   — and the history is a product feature, not just backtest data.
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
