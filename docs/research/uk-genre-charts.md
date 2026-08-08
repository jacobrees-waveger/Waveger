# UK genre charts — what the Official Charts Company actually publishes

Verified 2026-08-07. Every claim below was checked against the source that owns it —
officialcharts.com's own pages and its backing JSON API, the Apify actor's build record,
and Apple's developer documentation. Nothing here comes from Wikipedia or a chart blog.
Where a fact could not be verified it says so.

This feeds [ADR 0002](../adr/0002-chart-and-media-sources.md), which currently assumes one
chart (the Top 100 singles) reached through one Apify actor.

**The three findings that matter.** Genre singles charts are **not** subsets of the Top 100 —
on the week tested, 39 of 40 Rock & Metal entries were absent from it. The Apify actor's
`charts` parameter is an **unvalidated free-text list**, and two of the slugs its own README
advertises do not exist. And officialcharts.com is a Nuxt front end over a **public,
unauthenticated JSON API** that returns every genre chart, every archived week, with fields
the actor does not provide — including the `lastWeek` values ADR 0002 records as missing.

## 1. What the Official Charts Company publishes weekly

The company states it "compiles more than 50 charts of different shapes, sizes and flavours"
each week
([who-we-are/our-charts-and-data](https://www.officialcharts.com/who-we-are/our-charts-and-data/)).
The prose inventory is at
[who-we-are/all-the-official-charts](https://www.officialcharts.com/who-we-are/all-the-official-charts/),
but it names charts without linking them; the slugs come from the site's own chart index at
[/charts/](https://www.officialcharts.com/charts/).

### Chart week and publication day

The music chart week runs **Friday 00:01 to Thursday 00:00**, and video runs **Sunday 00:01 to
Saturday 00:00**
([getting-into-the-charts/how-the-charts-are-compiled](https://www.officialcharts.com/getting-into-the-charts/how-the-charts-are-compiled/)).
That page also says data arrives daily from a panel of more than 8,000 retailers, is matched by
Kantar, and that "by Friday morning, the final day's music data is added and, by lunchtime,
industry clients are receiving their first glance of the week's totals."

Charts are dated by the **Friday** the week closes. This is observable: on 2026-08-07 the current
singles chart was dated `20260731` and every music chart moved together. Historic weeks are dated
**Sunday** instead — the Dance chart's earliest archived week is `19940703`, a Sunday, and the
switch tracks the OCC's 2015 move of chart day from Sunday to Friday. That change is widely
reported but **I did not verify the switchover date at a primary source**; treat the exact
boundary as unverified. What is verified is that both date patterns exist in the archive and a
consumer must not assume Friday.

Two charts break the Friday cadence today:

- **Afrobeats** is dated **Sunday** (`20260726`, `20260802`) — a two-day offset from every other
  music chart, verified by fetching both.
- **British Asian Music Chart** is dated **Thursday** (`20260730`, `20260806`).

The **Chart Update** (`singles-chart-update`, `albums-chart-update`) is a midweek projection, dated
Monday (`20260727`), not a final chart.

I found **no page stating a publication day for the genre charts specifically**. The inference that
they publish alongside the main chart rests on their all sharing the same `20260731` date on the day
of checking, which is evidence but not a stated rule.

### Singles-side inventory

Depth is the number of entries the page actually renders, counted directly, not the number the
title claims. Cadence is weekly for all of these.

| Chart | Slug | Depth | Kind |
|---|---|---|---|
| Official Singles Chart Top 100 | `singles-chart` | 100 | Singles |
| Official Singles Chart Top 40 | `uk-top-40-singles-chart` | 40 | Singles |
| Official Singles Chart Update | `singles-chart-update` | 100 | Singles (midweek) |
| Official Streaming Chart | `streaming-chart` | 100 | Singles |
| Official Audio Streaming Chart | `audio-streaming-chart` | 100 | Singles |
| Official Video Streaming Chart | `video-streaming-chart` | 100 | Singles |
| Official Singles Sales Chart | `singles-sales-chart` | 100 | Singles |
| Official Singles Downloads Chart | `singles-downloads-chart` | 100 | Singles |
| Official Vinyl Singles Chart | `vinyl-singles-chart` | 40 | Singles |
| Official Dance Singles Chart | `dance-singles-chart` | 40 | Singles, genre |
| Official Rock & Metal Singles Chart | `rock-and-metal-singles-chart` | 40 | Singles, genre |
| Official Hip Hop and R&B Singles Chart | `official-hip-hop-and-r-and-b-singles-chart` | 40 | Singles, genre |
| Official Afrobeats Chart | `afrobeats-chart` | 20 | Singles, genre |
| Official Asian Music Chart | `asian-music-chart` | 40 | Singles, genre |
| Official British Asian Music Chart | `british-asian-music-chart` | 20 | Singles, genre |
| Official UK Christian & Gospel Singles Chart | `uk-christian-and-gospel-singles-chart` | 20 | Singles, genre |
| Official Independent Singles Chart | `independent-singles-chart` | 50 | Singles, ownership |
| Official Independent Singles Breakers Chart | `independent-singles-breakers-chart` | 20 | Singles, ownership |
| Official Classical Chart | `classical-chart` | 40 | Mixed (see below) |
| Official Irish Singles Chart | `irish-singles-chart` | 50 | Singles, territory |
| French Singles Chart | `french-singles-chart` | 20 | Singles, territory |
| End of Year Singles Chart | `end-of-year-singles-chart` | 100 | Singles, annual |

Also on the site but not the OCC's own compilations: `billboard-hot-100-chart`, `billboard-200`.

The **Official Classical Chart** (`classical-chart`, 40 deep) is listed under Classical rather than
Singles and its number 1 on the week checked was *Solo Piano* by Ludovico Einaudi — an album. I did
**not** establish whether it mixes formats or is albums-only; treat its kind as unverified.

### Albums-side inventory

| Chart | Slug | Depth |
|---|---|---|
| Official Albums Chart Top 100 | `albums-chart` | 100 |
| Official Albums Chart Update | `albums-chart-update` | 100 |
| Official Compilations Chart | `official-compilations-chart` | 100 |
| Official Albums Streaming Chart | `albums-streaming-chart` | 100 |
| Official Albums Sales Chart | `albums-sales-chart` | 100 |
| Official Album Downloads Chart | `albums-downloads-chart` | 100 |
| Official Physical Albums Chart | `physical-albums-chart` | 100 |
| Official Scottish Albums Chart | `scottish-albums-chart` | 100 |
| Official Soundtrack Albums Chart | `soundtrack-albums-chart` | 50 |
| Official Independent Albums Chart | `independent-albums-chart` | 50 |
| Official Independent Album Breakers Chart | `independent-albums-breakers-chart` | 20 |
| Official Classical Artist Albums Chart | `classical-artist-albums-chart` | 50 |
| Official Classical Compilation Albums Chart | `classical-compilation-albums-chart` | 50 |
| Official Specialist Classical Chart | `specialist-classical-chart` | 30 |
| Official Dance Albums Chart | `dance-albums-chart` | 40 |
| Official Rock & Metal Albums Chart | `rock-and-metal-albums-chart` | 40 |
| Official Hip Hop and R&B Albums Chart | `official-hip-hop-and-r-and-b-albums-chart` | 40 |
| Official Americana Chart | `americana-albums-chart` | 40 |
| Official Folk Albums Chart | `folk-albums-chart` | 40 |
| Official Vinyl Albums Chart | `vinyl-albums-chart` | 40 |
| Official Record Store Chart | `record-store-chart` | 40 |
| Official Progressive Albums Chart | `progressive-albums-chart` | 30 |
| Official Jazz & Blues Albums Chart | `jazz-and-blues-albums-chart` | 30 |
| Official Country Artists Albums Chart | `country-artists-albums-chart` | 20 |
| Official Country Compilations Chart | `country-compilations-chart` | 20 |
| Official Christian & Gospel Albums Chart | `christian-and-gospel-albums-chart` | 20 |
| Official Irish Albums Chart | `irish-albums-chart` | 50 |
| End of Year Albums Chart | `end-of-year-artist-albums-chart` | 100 |

Some album-side charts lag the current week: Folk was last dated `20260707` and Classical
Compilations `20260130` on the day of checking. Whether that is a slower publication cadence or a
stalled feed is **unverified**.

### Discontinued or stalled

- **Official Punjabi Music Chart** (`punjabi-chart`, 20 deep). Every date requested — including
  `20260731` — resolves to `20240825`. It has not published since August 2024.
- **Official Classical Singles Chart** (`classical-singles-chart`). The route still exists and the
  page title still renders, but it returns **zero entries at every date**, including the
  `20140831` week its own archive links point at. A Classical *Singles* chart evidently existed and
  was retired; the archive no longer renders. Do not count it as available.

## 2. Which genre charts exist for singles

This is the question with the most misinformation around it, so: enumerated, verified by fetching
each one.

**Genre charts that exist for singles**

| Genre | Singles chart? | Slug | Depth |
|---|---|---|---|
| Dance | **Yes** | `dance-singles-chart` | 40 |
| Rock & Metal | **Yes** | `rock-and-metal-singles-chart` | 40 |
| Hip Hop & R&B | **Yes** | `official-hip-hop-and-r-and-b-singles-chart` | 40 |
| Afrobeats | **Yes** | `afrobeats-chart` | 20 |
| Asian Music | **Yes** | `asian-music-chart` | 40 |
| British Asian Music | **Yes** | `british-asian-music-chart` | 20 |
| Christian & Gospel | **Yes** | `uk-christian-and-gospel-singles-chart` | 20 |

**Genres that are albums-only — there is no singles chart**

| Genre | Albums chart | Singles equivalent |
|---|---|---|
| Country | `country-artists-albums-chart`, `country-compilations-chart` | **None** |
| Americana | `americana-albums-chart` | **None** |
| Folk | `folk-albums-chart` | **None** |
| Jazz & Blues | `jazz-and-blues-albums-chart` | **None** |
| Progressive | `progressive-albums-chart` | **None** |
| Classical | `classical-artist-albums-chart` and three others | **Retired** (see above) |
| Soundtrack | `soundtrack-albums-chart` | **None** |

To answer the specific question asked: **there is no UK Official Country singles chart.** Country
exists only as an artist-albums chart and a compilations chart, both 20 deep. I tested
`country-singles-chart`, `country-artists-singles-chart` and `official-country-singles-chart` —
all are soft-404s (see the warning below). The same holds for Americana, Folk and Jazz.

**Independent is not a genre chart.** `independent-singles-chart` (50) and
`independent-singles-breakers-chart` (20) select on label ownership, not on musical style, and they
behave completely differently from the genre charts in the overlap analysis in section 4. Group them
separately.

### Warning: officialcharts.com soft-404s every unknown slug

`https://www.officialcharts.com/charts/<anything>/` returns **HTTP 200** whatever you put in it.
An invented slug (`totally-made-up-chart-xyz`) returns 200 with an empty `<title>` and zero chart
entries — byte-for-byte the same failure shape as a real-but-retired slug. There is no 404 to
detect. **Any scraper of this site must validate on parsed entry count, never on status code.**
This is the mechanism behind the actor defect in section 6.

## 3. Archive depth and date-addressable URLs

### The URL shape

The archive URL is `/charts/<slug>/YYYYMMDD/`, and it does work for genre charts exactly as it does
for the main singles chart. Requesting it **redirects** to a canonical form carrying a chart-instance
id:

```
GET /charts/dance-singles-chart/20260731/
 -> 200 https://www.officialcharts.com/charts/dance-singles-chart/20260731/104/
    "Official Dance Singles Chart on 31/7/2026"   40 entries
```

The instance id is per-chart and stable: `7501` singles, `104` dance, `111` rock & metal,
`114` hip hop & R&B, `130` independent, `254` independent breakers, and non-numeric for some
(`afrobeat`, `ukchrist`, `specclass`, `punjabi`). You do not need to know it — the redirect supplies
it — but you must follow redirects.

### The date-snapping hazard

The site **never 404s on a bad date**. It does one of two things, both silent:

- **A date inside the archive but not a chart week snaps to the nearest published week.** Requesting
  the Afrobeats chart at `20260731` returns the chart dated `20260726`. Nothing in the response
  body flags that a substitution happened.
- **A date outside the archive falls back to the current chart.** Requesting
  `/charts/dance-singles-chart/19500101/` returns the *current* Dance chart with no date in the URL
  at all.

A naive backfill that iterates dates and trusts the response will therefore write the current week's
rows under a 1994 date and report success. **Always parse the date out of the final URL or the page
title and compare it to what you asked for.**

One outright bug: `/charts/asian-music-chart/19500101/` resolves to
`/charts/asian-music-chart/15511218/asian/` and renders a chart titled "Asian Music Chart on
18/12/1551".

### Archive floors

Found by binary search on the redirect behaviour, then confirmed by checking that the week seven
days earlier falls back to the current chart:

| Chart | Earliest archived week | Day |
|---|---|---|
| Official Singles Chart | **1952-11-14** | Friday |
| Dance Singles | **1994-07-03** | Sunday |
| Rock & Metal Singles | **1994-10-09** | Sunday |
| Hip Hop & R&B Singles | **1994-10-09** | Sunday |
| Independent Singles | **1997-10-12** | Sunday |
| Independent Singles Breakers | **2009-06-28** | Sunday |
| Afrobeats | **2020-07-26** | Sunday |
| Punjabi Music | **2019-11-03** | Sunday (ends 2024-08-25) |
| British Asian Music | **2024-04-18** | Thursday |
| UK Christian & Gospel Singles | **2026-03-06** | Friday |

So the three substantial genre singles charts (Dance, Rock & Metal, Hip Hop & R&B) all have roughly
**32 years** of history, against 74 for the main chart. Christian & Gospel has five months.

I did not probe archive floors for the albums-side genre charts.

**Depth is not constant over time.** The Rock & Metal chart at its earliest week (1994-10-09) returns
**32** entries, not 40. The main singles chart at 1980-06-29 returns **75**, consistent with the Top
75 era noted in ADR 0002. Any schema must treat chart length as a property of the week.

## 4. Genre charts are not subsets of the Top 100

**This is the decisive finding.** Two separate claims, both tested.

### Can a song be on more than one genre chart in the same week?

**Yes.** Comparing all seven singles-side genre and independent charts for the week of 2026-07-31,
matching on the site's own song URL rather than on title strings, **27 of 198 distinct songs appeared
on more than one chart**. Three appeared on three charts at once. Examples:

| Song | Charts held simultaneously |
|---|---|
| DO YOU MIND — KYLA | Dance #13, Independent #10, Independent Breakers #2 |
| FREAKED OUT — FAT PAPI/PRODSHUSHY | Hip Hop & R&B #8, Independent #8, Independent Breakers #1 |
| TALK TO YOU — ANOTR/54 ULTRA | Dance #1, Independent #1 |

Most of that overlap is genre-against-Independent, which is expected — Independent selects on label
ownership and cuts across styles. The stricter question is whether two *genre* charts can hold the
same song. Across three sampled weeks (2026-07-31, 2026-06-19, 2025-12-12) the pure genre charts were
almost always disjoint, but **not always**: on 2025-12-12, *CHANEL* by TYLA was **Hip Hop & R&B #7 and
Afrobeats #1 in the same week**.

So genre charts are near-partitioning in practice but **not guaranteed disjoint**. A schema that
assumes one genre per song per week will eventually be wrong. Model it as many-to-many.

### Are genre charts subsets of the Top 100?

**No, emphatically.** Week of 2026-07-31, each genre chart compared against the Top 100 for the same
week:

| Chart | Entries | Not in that week's Top 100 |
|---|---|---|
| Rock & Metal Singles | 40 | **39 (98%)** |
| Afrobeats | 20 | **20 (100%)** |
| UK Christian & Gospel Singles | 20 | **20 (100%)** |
| Independent Singles | 50 | 33 (66%) |
| Hip Hop & R&B Singles | 40 | 32 (80%) |
| Dance Singles | 40 | 22 (55%) |
| Independent Singles Breakers | 20 | 13 (65%) |

The Rock & Metal chart's only Top 100 entry that week was *IRIS* at #75. Its other 39 places went to
catalogue: *THUNDERSTRUCK* (AC/DC), *SWEET CHILD O' MINE*, *BRING ME TO LIFE*, *NUMB*, *LIVIN' ON A
PRAYER*. Hip Hop & R&B likewise carried *HUMAN NATURE* and *DIRTY DIANA* (Michael Jackson), *HIPS
DON'T LIE*, *ONE DANCE*. These are decades-old tracks that stream steadily but never re-enter the
Top 100.

The Afrobeats and Christian & Gospel charts had **zero** overlap with the Top 100. They are entirely
separate populations of songs.

**Consequence for Waveger.** Genre charts cannot be derived by filtering the Top 100 — the
information is not in it. Ingesting them means ingesting seven more charts as first-class Chart Weeks
with their own song populations, their own archive floors, and their own cadence. And because they
are catalogue-heavy, they behave nothing like the Top 100 as game material: a chart where AC/DC and
Guns N' Roses are permanent fixtures has very little week-to-week movement to score.

## 5. Artist-level charts

**The OCC publishes no artist-level chart, and I could not find evidence one has ever existed.**

Every "artist" chart on the site ranks *albums*, not artists. "Artist albums" is OCC terminology for
albums credited to a named artist, as opposed to compilations — `country-artists-albums-chart`,
`classical-artist-albums-chart` and `end-of-year-artist-albums-chart` are all albums charts. The last
of these renders under the title "End of Year Albums Chart", 100 deep.

I probed `artist-chart`, `artists-chart`, `official-artist-chart` and `biggest-artists-chart`. All
are soft-404s: HTTP 200, empty title, zero entries.

`/artists/` and `/artist/<slug>/` exist, but they are **per-artist chart-history profile pages**, not
a ranking of artists against each other.

The company publishes editorial "biggest artists of the year" round-ups in its news section. I could
**not** verify their methodology, cadence or whether they constitute a published chart with rules —
the specific end-of-year article URL I tried returned 404. **Treat any artist-level ranking as
unverified and unavailable as a data feed.**

If Waveger needs an artist-level signal it will have to derive one from song-level chart rows, which
it can do freely since it owns the archive.

## 6. What the Apify actor can actually reach

Actor: [`jungle_synthesizer/officialcharts-uk-singles-albums-chart-scraper`](https://apify.com/jungle_synthesizer/officialcharts-uk-singles-albums-chart-scraper),
actor id `Y5AtTGjiHeRcZFFk7`, latest build `0.1.6` finished 2026-08-01.

The store page renders a summary; the authoritative artefact is the build record at
`https://api.apify.com/v2/actor-builds/QvaJRUUZniqaqwQt4`, which carries the input schema and README
as published. The schema below is quoted from it verbatim.

### The `charts` parameter, quoted

```json
"charts": {
  "title": "Charts to scrape",
  "type": "array",
  "description": "List of chart slugs to scrape. Defaults to singles-chart and albums-chart. Available: singles-chart, albums-chart, dance-singles-chart, dance-albums-chart, indie-singles-chart, indie-albums-chart, etc.",
  "editor": "stringList",
  "sectionCaption": "Input Configuration",
  "prefill": ["singles-chart", "albums-chart"]
}
```

**There is no `enum`.** `charts` is an `array` with `editor: "stringList"` — free-text. Nothing
validates what you put in it, and the accepted-values question has no answer at the schema level: the
actor will accept any string. The description offers examples and then says "etc.".

The README's slug list is the only other guidance:

> `singles-chart`, `albums-chart`, `dance-singles-chart`, `dance-albums-chart`, `indie-singles-chart`,
> `indie-albums-chart`, `classical-chart`, `irish-singles-chart`, `irish-albums-chart`,
> `afrobeats-chart`, `country-artists-albums-chart`, `folk-albums-chart`

**Two of those twelve slugs do not exist on officialcharts.com.** `indie-singles-chart` and
`indie-albums-chart` are soft-404s — the real slugs are `independent-singles-chart` and
`independent-albums-chart`. I verified this directly:

```
/charts/indie-singles-chart/         HTTP 200   0 entries   title: "| Official Charts"
/charts/independent-singles-chart/   HTTP 200  50 entries   title: "Official Independent Singles Chart"
/charts/totally-made-up-chart-xyz/   HTTP 200   0 entries   title: "| Official Charts"
```

The advertised slug is indistinguishable from an invented one. Combined with the site's soft-404
behaviour, a run configured with `indie-singles-chart` will **succeed, return zero records for that
chart, and charge you the actor-start fee** — unless the actor validates entry counts, which the
README gives no reason to believe it does.

### Remaining input schema, quoted

```json
"resumeCursor": { "type": "string", "editor": "textfield",
  "description": "Leave empty for a fresh crawl. To CONTINUE a previous run where it stopped — without paying again for records you already received — paste the `resumeCursor` value from that run's Output..." },
"startDate":  { "type": "string", "editor": "textfield", "prefill": "",
  "description": "Earliest chart date to fetch, format YYYY-MM-DD. Leave empty for the current week only." },
"endDate":    { "type": "string", "editor": "textfield", "prefill": "",
  "description": "Latest chart date to fetch, format YYYY-MM-DD. Leave empty for the current week only." },
"maxItems":   { "type": "integer", "editor": "number", "prefill": 10,
  "description": "Maximum number of records to scrape (across all charts and weeks)" }
```

`maxItems` is the only `required` field. Three feedback fields (`sp_intended_usage`,
`sp_improvement_suggestions`, `sp_contact`) collect telemetry for the author and do not affect the
crawl. Note the schema's `maxItems` prefill is **10**, while both the README table and the store page
say the default is **15** — the actor's own documentation contradicts its own schema.

### How it works, and why genre charts are plausible but unproven

The README describes the crawl:

> 1. **Chart discovery** — fetches the current chart page to identify the chart ID and most-recent published date
> 2. **Chart extraction** — fetches weekly archive pages (`/charts/<slug>/YYYYMMDD/<chart-id>/`) and extracts all 100 chart entries per page

That is exactly the URL shape verified in section 3, and it is slug-agnostic, so a genre chart
*should* work. But note "extracts all 100 chart entries per page" and the output schema's
`rank | integer | Chart position (1–100)` — the actor is written against a 100-deep chart. Genre
charts are 20 to 50 deep. Whether it handles a short chart correctly or treats it as a partial page
is **unverified**.

**I did not run the actor against a genre slug.** Doing so costs real money on an account whose
Free-plan cap is $5/month, and it is a spend decision for the human, not for me. The verification
that matters is cheap and specific: run once with `charts: ["dance-singles-chart"]`,
`startDate`/`endDate` set to a single week, `maxItems: 45`, and check you get 40 records with the
right `chart_date`. That costs about $0.14.

Pricing is unchanged from ADR 0002, confirmed from the actor record: pay-per-event,
`apify-actor-start` $0.10 per run, `data-record` $0.001 per record.

Current stats from the actor record: 100 total runs, 6 total users, 0 reviews. Last 30 days:
29 succeeded, 6 failed, 1 aborted — a **19% non-success rate**, matching ADR 0002's observation.

## 7. Alternatives for UK genre chart history

### There is only one Apify actor

Searching the Apify store API for `officialcharts`, `official charts`, `uk chart` and `music chart`
returns exactly one actor covering officialcharts.com — the one already in use. Everything else in
those results targets Apple Music, Spotify, Kworb, Melon, app stores or podcasts. **There is no
competing actor to fall back to.**

### The best alternative: officialcharts.com's own JSON API

officialcharts.com is a Nuxt front end. Its inline runtime config names its backend:

```js
window.__NUXT__.config = { public: { drupalBaseURL: "https://backstage.officialcharts.com",
  drupalCe: { baseURL: "https://backstage.officialcharts.com/ce-api", ... } } }
```

That endpoint is **public, unauthenticated, and returns JSON**:

```
GET https://backstage.officialcharts.com/ce-api/charts/dance-singles-chart/20260731/104/
    200  application/json  ~50 KB
```

Each entry is a structured object, not scraped HTML:

```json
{ "element": "track-info", "nid": "474429", "title": "TALK TO YOU",
  "url": "/songs/anotr-talk-to-you", "artist": "ANOTR/54 ULTRA",
  "artistUrl": "/artist/anotr", "position": 1, "lastWeek": 1, "peak": 1, "weeks": 21,
  "new": false, "reentry": false,
  "imageSrcLarge": "https://is1-ssl.mzstatic.com/image/thumb/.../247x247bb.jpg",
  "audioSrc": "https://audio-ssl.itunes.apple.com/itunes-assets/.../mzaf_...m4a",
  "infoUrl": "https://backstage.officialcharts.com/ajax/charted-item/chart/482892/474429" }
```

Verified working for every chart and every archived week tested, including
`rock-and-metal-singles-chart/19941009/111/` and `singles-chart/19800629/7501/`.

It is **better than the actor on four counts**, all verified:

1. **`lastWeek` is complete.** ADR 0002 records that the actor returns null `lastWeek` for all 41
   descending entries. On the same chart week through this API, **all 41 descenders carry
   `lastWeek`**; the only nulls are the 11 genuine new entries and re-entries. The defect is the
   actor's, not the source's. ADR 0002's "derive `last_week` ourselves" mitigation is still sound
   and still cheaper, but it is no longer forced.
2. **It fails visibly.** Unlike the HTML site, the API never serves a different week's entries
   under the date you asked for, so the silent-wrong-week hazard of section 3 disappears.

   **Corrected 2026-08-08** (WAV-29, re-measured against the live endpoint): the claim that it
   does *not* snap dates, and that a bad date or chart id returns `{"title": null}` with zero
   entries, is wrong on both counts. A date it does not publish returns **HTTP 200** with
   `{"redirect": {"url": "/charts/singles-chart/20260724/7501/"}}` — the snap is present, it is
   just in the body, and it carries no chart list. A chart id it does not have returns **HTTP 500
   with an HTML error page**, not JSON at all. A consumer must check the status before parsing,
   and must not follow that redirect. See ADR 0017's correction section.
3. **Stable identifiers.** Each row carries a Drupal node id (`nid`) for the song and a
   `/songs/<slug>` URL. That is a real primary key, far better than matching on artist and title
   strings.
4. **A per-row detail endpoint** at `infoUrl` returns the fields the actor admits it cannot get:

```json
{ "id": "474429", "peak": 1, "thisWeek": 1, "lastWeek": 1,
  "label": "NO ART", "catNo": "CBEFB2600137",
  "firstCharted": "<time class=\"date\" pubdate datetime=\"2026-03-19\">19/03/2026</time>",
  "purchaseLinks": { "apple": "https://geo.music.apple.com/album/1870514330?at=11lIRD" },
  "stats": [ {"label":"No1","value":3}, {"label":"Top 10","value":22}, ... ],
  "chartRuns": [ ... ] }
```

Note that some fields arrive as rendered HTML fragments rather than values — `firstCharted` above is
a `<time>` element — so this endpoint is a view model, not a clean data contract.

**The `purchaseLinks.apple` field carries an Apple Music album id.** It was present on 12 of the 12
Top 100 rows I sampled. If that coverage holds, it collapses ADR 0002's fragile
artist-plus-title join into an id lookup. This is the single most consequential thing in this
document after section 4, and it deserves a proper coverage measurement across a full chart and
several archive eras before anything is built on it — **I sampled 12 rows, which is not enough to
call it reliable.**

**Caveats, stated plainly.** This API is **undocumented and unannounced**. Its stability is exactly
the stability of the website's own front end, which is to say it can change without notice and there
is no contract. `robots.txt` does not disallow `/charts/` and sets no crawl-delay, but that is not
permission — the OCC sells chart data commercially, and using this endpoint at volume is a
commercial and legal question for the human, not a technical one. The `backstage.` host is plainly an
internal name.

### Licensed data

The OCC "operates a range of data services for the entertainment industry", "available only to
entertainment industry professionals, on a subscription and one-off basis"
([our-charts-and-data](https://www.officialcharts.com/who-we-are/our-charts-and-data/)). **No public
API is offered and no pricing is published.** ADR 0002 already declines this route.

### Cost and date-addressability compared

| Source | Genre charts | Date-addressable | Cost | Fails safely |
|---|---|---|---|---|
| Apify actor | Plausible, unproven | Yes, `startDate`/`endDate` | $0.10/run + $0.001/record | No — soft-404 returns zero records, still charged |
| `ce-api` direct | **Verified** | Yes, exact week required | Free (bandwidth only) | **Yes** — empty response on any bad input |
| OCC licensed feed | Presumably | Unknown | Unpublished, B2B only | n/a |

## 8. Genre metadata from Apple Music as an alternative

If OCC genre charts are unusable as game material — and section 4 argues they largely are — genre can
instead be a *label* attached to songs from the one Top 100 chart. Apple can supply that label.

### Songs and artists both carry genres, and both carry several

From the Apple Music API reference, read as the structured JSON that backs
[`Songs.Attributes`](https://developer.apple.com/documentation/applemusicapi/songs/attributes-data.dictionary)
and
[`Artists.Attributes`](https://developer.apple.com/documentation/applemusicapi/artists/attributes-data.dictionary):

| Resource | Attribute | Type | Required |
|---|---|---|---|
| `Songs.Attributes` | `genreNames` | `[string]` | **Yes** |
| `Artists.Attributes` | `genreNames` | `[string]` | **Yes** |

Both are **arrays of strings and both are required**. So:

- Yes, Apple exposes a genre for a song and for an artist.
- **An artist does not have a single primary genre.** `genreNames` is plural at the type level for
  both resources. The documentation does **not** state whether the array is ordered by primacy, and
  I could not find any statement that element zero is the primary genre. **Do not assume it.**

The `Artists.Attributes` object is small — `artwork`, `editorialNotes`, `genreNames`, `inFavorites`,
`name`, `url` — so `genreNames` is essentially the only descriptive facet available at artist level.

Worth recording since it bears on ADR 0002: `Songs.Attributes` also carries an optional **`isrc`**,
alongside `albumName`, `artistName`, `artwork`, `previews`, `releaseDate`, `durationInMillis`,
`composerName`, `contentRating` and `isAppleDigitalMaster`. The ISRC gap ADR 0002 describes is on the
chart side, not Apple's.

### The taxonomy is hierarchical

From
[`Genres.Attributes`](https://developer.apple.com/documentation/applemusicapi/genres/attributes-data.dictionary):

| Attribute | Type | Required | Description |
|---|---|---|---|
| `name` | string | Yes | The localized name of the genre |
| `parentId` | string | No | The identifier of the parent for the genre |
| `parentName` | string | No | The localized name of the parent genre |
| `chartLabel` | string | No | (Extended) A localized string to use when displaying the genre in relation to charts |

`parentId`/`parentName` make the taxonomy **explicitly hierarchical**, and a top-level genre is one
with no parent. The presence of `chartLabel` shows Apple itself expects genres to be used as chart
facets.

### How many top-level genres

The Apple Music API reference does not publish the genre list, and calling
`/v1/catalog/{storefront}/genres` needs a developer token. As a proxy I read Apple's public iTunes
store genre service, which returns the same music genre tree:

```
GET https://itunes.apple.com/WebObjects/MZStoreServices.woa/ws/genres?id=34
```

It returns **51 top-level music genres**, most with subgenres: African (32 subgenres), Alternative
(15), Blues (7), Christian (11), Classical (42), Country (13), Dance (9), Electronic (10), Folk (2),
Hip-Hop/Rap (23), Jazz (16), Pop (29), R&B/Soul (8), Reggae (5), Rock (24), Worldwide (32), and so on.

**Mark this as corroborating, not authoritative.** It is an Apple-owned endpoint returning the iTunes
Store genre tree; I did **not** verify that it is identical to what the Apple Music API's `genres`
endpoint returns for the `gb` storefront. The hierarchy and the rough order of magnitude are the
reliable parts, not the exact count of 51.

### The labels come back at subgenre granularity, and they vary by release

A practical caution, from Apple's public iTunes Search API (Apple-owned, keyless, returns
`primaryGenreName`):

```
"Talk To You (feat. 54 Ultra)"          -> primaryGenreName: "Dance"
"Talk To You (feat. 54 Ultra) [Mixed]"  -> primaryGenreName: "House"
AC/DC (artist)                          -> primaryGenreName: "Hard Rock"  (primaryGenreId 1152)
```

Two releases of the same track return different genre labels, and the values returned are
**subgenres** ("House", "Hard Rock"), not top-level genres. Any genre facet built on Apple data will
need to walk `parentId` up to a top-level genre to produce a stable, small set of buckets, and will
need to pick a canonical release per song. This is from the iTunes Search API rather than the Apple
Music API and is **corroborating evidence, not a specification** — but the shape of the problem is
real and will recur.

## Open questions

Things this document could not settle:

- **Does the Apify actor actually return genre charts?** Untested — it costs money. The $0.14
  experiment is specified in section 6.
- **Does it handle a 20-deep chart correctly**, given its output schema documents `rank` as 1–100?
- **What is the real coverage of `purchaseLinks.apple`?** 12 of 12 sampled is not a measurement.
  Check a full chart week, and check a 1994 week where Apple ids are less likely to exist.
- **Is `Songs.Attributes.genreNames` ordered by primacy?** Apple does not say. Test empirically
  before relying on element zero.
- **Is the `ce-api` endpoint acceptable to use?** A commercial and legal question, not a technical
  one.
- **Is the Official Classical Chart singles, albums or mixed?** Its number 1 was an album; the site
  files it under Classical rather than Singles.
- **Why do Folk and Classical Compilations lag the current week** — slower cadence, or a stalled
  feed?
- **When exactly did chart day move from Sunday to Friday?** Both patterns are present in the
  archive; the changeover date was not verified at a primary source.
