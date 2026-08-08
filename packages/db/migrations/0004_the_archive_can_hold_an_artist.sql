-- The archive learns who an Artist is.
--
-- The schema alone, ahead of the code that fills it (ADR 0015). Nothing reads
-- any of this yet, and the code serving while it is applied survives all three
-- changes: `chart` is reference data no running code writes, `artist` is a new
-- table nothing queries, and an Entry may still be written without an Artist.

-- How this Chart is addressed at the Chart Compiler.
--
-- Neither of these is Waveger's own name for the Chart, which is `slug`, and
-- neither is configuration: they are reference data about which Chart this is,
-- seeded exactly as `position_count` already is. A Chart Week is addressed at
-- the source by the Compiler's slug, the date and the Compiler's own numeric
-- id for the Chart together — 7501 for the Top 100 singles, 104 for Dance
-- (ADR 0017).
alter table chart add column compiler_slug text;
alter table chart add column compiler_chart_id integer;

update chart
set compiler_slug = 'singles-chart', compiler_chart_id = 7501
where slug = 'uk-singles';

-- Backfilled above, so the constraint is stated now rather than left for
-- later: a Chart that cannot be addressed at the source is a Chart nothing can
-- ever fetch a week of.
alter table chart alter column compiler_slug set not null;
alter table chart alter column compiler_chart_id set not null;

-- Two Waveger Charts cannot address the same Chart at the Compiler. They would
-- ingest the same source rows into two archives of the same weeks, and nothing
-- downstream could tell that had happened — `slug` being distinct is exactly
-- what would hide it.
alter table chart add constraint chart_compiler_address_key
  unique (compiler_slug, compiler_chart_id);

-- The act credited on a Song, as the Chart Compiler resolves it.
--
-- The key is the Compiler's own artist id and never one of ours, because which
-- credits count as the same Artist is the Compiler's rule and not Waveger's
-- (`CONTEXT.md`). That is what lets `SAM FENDER & OLIVIA DEAN` and `SAM FENDER`
-- be one Artist without anything here parsing a credit string — measured at 19
-- of 622 ids spanning more than one credit (`docs/research/squad-viability.md`).
--
-- The id is text although every one measured is a number: it arrives as a path
-- segment from an undocumented endpoint (ADR 0017), and kept as reported it
-- cannot fail to parse. It is an identity to compare and never something to
-- count with.
create table artist (
  id   text primary key,
  name text not null
);

-- Which Artist the Compiler resolved this Entry's credit to.
--
-- Nullable, and permanently so rather than as a step towards `not null`. A
-- Chart Week is Held on whether every Position is there and never on whether
-- its source reported Artist identity, and the retained Apify adapter reports
-- none (ADR 0017). An Entry with no Artist is a fact about the source that
-- fetched it.
--
-- Deliberately unindexed. Postgres does not index the referencing side of a
-- foreign key, and scoring a Squad will ask for an Artist's Entries — but no
-- query does yet, and an index chosen before its query is a guess at the
-- columns it should lead on. It belongs to the ticket that adds the read.
alter table entry add column artist_id text references artist (id);
