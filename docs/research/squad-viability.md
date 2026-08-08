# Does a Squad game work on the UK Top 100?

Research date: 2026-08-08. Measured against 104 consecutive Chart Weeks (2024-08-09 to 2026-07-31)
plus 52 weeks each of three genre charts, pulled live from officialcharts.com's own JSON API. 260
requests, zero failures, no money spent. Scripts in `squad-viability/`; rerun `fetch.mjs` to
reproduce the dataset, then the four analysis scripts against it.

The question this answers: the game half of `CONTEXT.md` describes two games, and neither has ever
been tested against real chart data. A **Squad** — Artists held across a Season under a budget — was
one line in the glossary. This measures whether it is a game at all before anything is built.

## Method

Points per Artist per Chart Week are `101 - position`, summed over that Artist's Entries. That is
deliberately the crudest possible scoring rule: every finding below is a property of the *chart*, not
of a scoring model that could be tuned to flatter it. Seasons are 13 Chart Weeks. Prices are derived
from the prior 13 weeks, floored at 4.0 and capped at 15.0 coins against a 100-coin budget and 15
slots. Squad selection is an exact knapsack over 0.1-coin units, not a greedy approximation.

## What holds up

### Artist identity comes free from the Chart Compiler

`CONTEXT.md` says which credits count as the same Artist is the Chart Compiler's rule and not
Waveger's. `packages/api/src/chart/validate.ts` honours that by counting the credit as published and
declining to "go looking for the same person inside a longer credit" — which is why nothing in the
codebase can currently tell you that `SAM FENDER & OLIVIA DEAN` and `SAM FENDER` are one Artist.

The API answers this directly. Every row carries `artistUrl`, e.g. `/artist/54705/sam-fender`,
resolved by the Compiler to the **lead** Artist:

| | |
|---|---|
| Entries measured | 10,400 |
| Entries missing an artist id | **0** |
| Distinct artist ids | 622 |
| Distinct full credit strings | 643 |
| Artist ids spanning more than one credit string | 19 |

Those 19 are the Compiler merging collaborations for us. A Squad of Artists therefore needs **no**
credit-string parsing, and gets its identity from the same authority `CONTEXT.md` already defers to.

### The three-per-artist cap holds exactly, grouped correctly

**Zero** artist-weeks over the cap across all 10,400 Entries. ADR 0002 chose this Chart partly for
that cap, and verified it once by hand against one week. This confirms it over two years — and does
so grouped by **lead artist id**, where `validate.ts` groups by credit string. Grouping by credit
string is the weaker test: it counts `DRAKE` and `DRAKE FT X` separately, so a genuine breach of the
Compiler's rule could pass it. The flag is documented as deliberately narrow, so this is a limit to
know about rather than a defect.

### An Artist is a portfolio, a Song is not

| Entries held simultaneously by one lead Artist | Artist-weeks | Share |
|---|---|---|
| 1 | 5,963 | 76.8% |
| 2 | 966 | 12.4% |
| 3 | 835 | 10.8% |

**23% of the time an Artist holds more than one Entry**, and 11% of the time they hold the Compiler's
full permitted three. This is the argument for Artists over Songs, measured: an Artist has upside
from a new release and a floor from catalogue, with a ceiling the Compiler enforces for free.

### The pick pool is deep enough

75 distinct lead Artists per Chart Week (min 66, max 88); **134 across a 13-week Season**; 384 across
a year; 622 across two. Fifteen slots against 134 Artists is a real selection problem.

### The budget genuinely binds

The unconstrained top 15 Artists by prior-window points cost between **177 and 196 coins** in every
one of seven windows, against a budget of 100. You can afford roughly half an elite squad, which is
the constraint doing its job rather than decorating the screen.

### There is skill, and it is not solved

Seven back-to-back 13-week window pairs:

| Measure | Result |
|---|---|
| Artist points, prior window vs next | **r = 0.72** (0.60–0.78) |
| Form-picked squad vs random affordable squads | beats **99%** of them |
| Random squad spread, p5 to p95 | **5–10x** |
| Form-picked squad as a share of the hindsight ceiling | **40–56%** |
| Artists shared between consecutive hindsight-optimal squads | **0–1 of 15** |

Read together: past form predicts future form strongly enough that research pays (99th percentile),
but captures under half the available points, so there is a great deal left to compete over. And no
squad dominates twice — consecutive perfect squads share almost nothing, because the ceiling is
reached by cheap Artists who broke out, and those change every window by definition.

`r = 0.72` is the number to hang this on. Around 0.7 is where past form informs without determining.

ADR 0003 rejected scoring on presence partly because a public prediction market priced next week's
number one at 98%, and cites rank-turbulence work showing consecutive Chart Weeks are turbulent in
ordering. Both remain true. They are not in conflict with this: **Chart Weeks are turbulent in
ordering while Artists are stable in aggregate over a quarter.** A Slip rides the weekly turbulence;
a Squad rides the quarterly stability.

## What does not hold up

### Rock & Metal is a dead scoring surface

An earlier reading of the genre charts treated the Rock & Metal chart's catalogue-heavy composition
as the variety win — 82% of its Artists never touch the Top 100. Measured over 52 weeks that is
exactly backwards:

| Chart | Artists/52wk | Artists/week | Not in Top 100 | r, window to window |
|---|---|---|---|---|
| Top 100 | 384 | 75 | — | 0.72 |
| Dance | 148 | 39 | 55% | 0.69 |
| Hip Hop & R&B | 123 | 31 | 46% | 0.53 |
| **Rock & Metal** | **38** | 22 | 82% | **0.98** |

**r = 0.98 and 38 distinct Artists in a whole year.** It is the same records in nearly the same order
every week. That is variety of *content* and the opposite of variety of *outcome*: every player picks
the same three Rock Artists and they all score the same. A genre quota including Rock & Metal is a
tax on everyone equally, not a trade-off.

Dance (0.69) and Hip Hop & R&B (0.53) both behave like real scoring surfaces, the latter more
volatile than the Top 100 rather than less.

**Genre charts must be validated one at a time, not adopted as a set.**

### The pick pool gain from genre charts is smaller than claimed

An earlier estimate that genre charts "roughly double the pick pool" came from a song-level count of
a single week. At Artist level over 52 weeks across three genre charts the combined pool is 552
Artists against 384 for the Top 100 alone — **44% wider**, not 2x.

### Squads do not rot, which weakens the weekly decision

**14–15 of any window's top 15 Artists are still scoring in the next window.** This is good for the
Squad-of-Artists premise and bad for the transfer mechanic: there are no injuries, no rotation and no
suspensions here, so the pressure that forces a Fantasy Premier League manager to act each week
largely does not exist. A weekly free transfer is a much weaker hook than the FPL analogy suggests,
and whatever carries weekly engagement will have to be found elsewhere.

## Not measured

- **Afrobeats.** Its chart id could not be discovered the way the others could, so it is absent from
  every genre figure above.
- **The Slip.** Nothing here tests whether movement Calls priced from base rates reward skill. The
  Squad has been measured and the Slip has not, so any comparison between them is asymmetric and
  should be discounted accordingly.
- **Anything before 2024-08-09.** Two years is seven window pairs. It is enough to see the effects
  above clearly and not enough to characterise their variance.
- **Price movement.** Prices here are static within a Season, derived from the prior one.

## Source

Data came from `https://backstage.officialcharts.com/ce-api/charts/<slug>/<YYYYMMDD>/<chartId>/`, the
JSON backend behind officialcharts.com's Nuxt front end. See `uk-genre-charts.md` for how it was
found and how it compares to the Apify actor ADR 0002 currently uses. Chart ids observed:
`singles-chart` 7501, `dance-singles-chart` 104, `rock-and-metal-singles-chart` 111,
`official-hip-hop-and-r-and-b-singles-chart` 114.

**This endpoint is undocumented and unlicensed.** The Official Charts Company
[sells chart licensing](https://www.officialcharts.com/our-business-services/chart-licensing/)
covering these exact genre charts, its
[copyright notice](https://www.officialcharts.com/who-we-are/copyright-notice/) prohibits
"reproduction, transfer, transmission or dissemination beyond what is permitted by the Official
Charts Company's subscription and licensing agreements", and its `robots.txt` names over 500 blocked
agents including `anthropic-ai`. The Apify actor scrapes the same site for the same data, so this
exposure is not created by choosing this endpoint — it is the position Waveger is already in, and
ADR 0009 makes the repository public. Using either at product volume is a commercial decision, and
`commercial@officialcharts.com` is the route.
