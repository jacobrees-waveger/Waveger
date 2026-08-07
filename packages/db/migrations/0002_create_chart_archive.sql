-- The archive Waveger owns.
--
-- ADR 0002 makes the Apify actor load-bearing and unproven, so every row it
-- returns is persisted here on arrival. If the actor disappears we keep the
-- whole archive and lose only future weeks.

-- An externally compiled ranking, published on a fixed weekly cadence.
--
-- A Chart Week belongs to a Chart from this first migration so that neither a
-- second Chart nor the 1952 backfill is precluded. Neither is built here.
--
-- `position_count` is the Chart's own size, and is what a Chart Week is
-- validated against: the Chart states how many Positions it has, and a week
-- with any other number of them is not that Chart's week.
create table chart (
  slug           text primary key,
  name           text not null,
  position_count integer not null check (position_count > 0)
);

-- The one Chart the product reads today (ADR 0002). Reference data rather than
-- something ingestion creates, so a typo in a Chart Week identifier is a
-- missing Chart and not a new one.
insert into chart (slug, name, position_count)
values ('uk-singles', 'UK Official Singles Chart', 100);

-- One published edition of a Chart, covering one fixed tracking period.
--
-- `week_date` is the Chart Compiler's published date. It is a calendar date and
-- never an instant: see the DATE type parser in `packages/db/src/client.ts`.
create table chart_week (
  id          uuid primary key default gen_random_uuid(),
  chart_slug  text not null references chart (slug),
  week_date   date not null,
  unique (chart_slug, week_date)
);

-- A recording eligible to appear on a Chart.
--
-- The Apify payload carries no ISRC (ADR 0002), so identity is a conservative
-- normalised fingerprint of Artist and title — see `chart/fingerprint.ts` for
-- what it normalises and why it does no more than that. `title` and `artist`
-- hold the credit as first reported, which is what a visitor is shown.
create table song (
  id          uuid primary key default gen_random_uuid(),
  fingerprint text not null unique,
  title       text not null,
  artist      text not null
);

-- One row of one Chart in one Chart Week: a Song at a Position.
--
-- The primary key is the Chart Week and the Position, which is what makes
-- duplicate Positions impossible to persist and re-ingestion an upsert. There
-- is deliberately no movement column: WAV-10 derives movement at read time by
-- self-joining the previous Chart Week, so a later correction to a past week
-- fixes its neighbours with no reprocessing step.
--
-- `peak_position` and `weeks_on_chart` are the Chart Compiler's own figures for
-- this Entry, retained as reported.
create table entry (
  chart_week_id  uuid not null references chart_week (id) on delete cascade,
  position       integer not null check (position > 0),
  song_id        uuid not null references song (id),
  peak_position  integer not null,
  weeks_on_chart integer not null,
  primary key (chart_week_id, position)
);

-- What happened every time ingestion ran, whether or not it wrote anything.
--
-- `payload` is exactly what the ChartSource returned, so a week can be replayed
-- against changed parsing without paying the actor for the fetch again. It is
-- null only when the fetch itself failed and there was nothing to store.
--
-- `flags` records what the run noticed but did not act on — an Artist over the
-- Chart Compiler's three-per-week cap, for instance. Waveger consumes Charts
-- and never compiles them, so a breach of the Compiler's own rules is evidence
-- about the source, not something to correct or to reject a week over.
create table ingestion_run (
  id         uuid primary key default gen_random_uuid(),
  chart_slug text not null references chart (slug),
  week_date  date not null,
  status     text not null check (status in ('succeeded', 'failed')),
  failure    text,
  flags      jsonb not null default '[]'::jsonb,
  payload    jsonb,
  ran_at     timestamptz not null default now(),
  -- A failed run explains itself; a succeeded one has nothing to explain.
  check ((status = 'failed') = (failure is not null))
);

create index ingestion_run_week on ingestion_run (chart_slug, week_date, ran_at desc);
