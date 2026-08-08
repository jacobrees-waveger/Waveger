# Chart data comes from the Official Charts API, not the Apify actor

ADR 0002 buys chart Positions from an Apify actor. They come instead from
`backstage.officialcharts.com/ce-api`, the JSON backend behind
officialcharts.com's own front end, with the actor retained as a fallback
adapter behind the `ChartSource` seam that ADR 0002 built for exactly this.

Everything else in ADR 0002 stands: why the UK chart, owning every row, Apple
Music for media, and a failed catalogue join never blocking Settlement.

## What changes

The endpoint is `/ce-api/charts/<slug>/<YYYYMMDD>/<chartId>/`, public and
unauthenticated. Verified over 260 requests across four charts and 104
consecutive Chart Weeks with **zero failures and zero empty responses**
(`docs/research/uk-genre-charts.md`, `docs/research/squad-viability.md`).

It beats the actor on five counts:

1. **`lastWeek` is complete.** ADR 0002 records the actor returning null for all
   41 descending Entries. The same week through this API carries `lastWeek` on
   all 41. That defect is the actor's, not the source's. Deriving Movement
   ourselves stays right — it is what makes a corrected week fix its neighbours
   — but it is no longer forced.
2. **A lead-artist id on every row.** 100% coverage over 10,400 Entries. This is
   what makes a Squad of Artists possible at all (ADR 0016), and it is the
   Compiler's own identity, which is what `CONTEXT.md` defers to.
3. **It fails cleanly.** No date-snapping. A bad date or chart id returns zero
   Entries rather than silently serving a different week — unlike the HTML site,
   which returns HTTP 200 for any slug you invent.
4. **Stable identifiers.** A node id per Song, rather than matching on artist
   and title strings.
5. **Genre charts are reachable.** The actor is named for singles and albums and
   its `charts` input has no enum, so a typo'd slug returns nothing and still
   charges.

It is also **free**, which is not the main reason but is the reason the game
could be validated against two years of real data before anything was built.

## What this costs

The endpoint is **undocumented and unannounced**. It has no contract and can
change without notice; its stability is the stability of a website's front end.
The `backstage.` hostname is plainly internal. Mitigation is the `ChartSource`
seam: the actor stays implemented, so a replacement is a swap and not a rewrite.

`purchaseLinks.apple` on the per-row detail endpoint carries an Apple Music
album id, which would collapse ADR 0002's artist-plus-title join into an id
lookup and may remove the need for the manual-override table. **This is
unverified at 12 sampled rows** and needs a coverage measurement across a full
Chart Week and several archive eras before anything is built on it.

## The licensing question, which is not a technical one

The Official Charts Company sells chart licensing covering these exact charts.
Its copyright notice prohibits "reproduction, transfer, transmission or
dissemination beyond what is permitted by the Official Charts Company's
subscription and licensing agreements". Its `robots.txt` names over 500 blocked
agents.

**This exposure is not created by this decision.** The Apify actor scrapes the
same site for the same data; it only puts a third party in the middle. Waveger
was already publishing unlicensed chart data, and ADR 0009 makes the repository
public. Choosing this source changes the technical position and not the
commercial one.

A licence must be settled before public launch. `commercial@officialcharts.com`
is the route. This ADR records the obligation rather than discharging it.
