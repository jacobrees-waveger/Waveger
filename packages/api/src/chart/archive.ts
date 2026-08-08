import type {
  Database,
  IngestionFlag,
  IngestionRunStatus,
} from '@waveger/db'
import type { ChartExit, ChartWeek, ChartWeekId } from '@waveger/domain'
import type { Kysely } from 'kysely'
import { chartWeeksFrom, previousChartWeekDate } from './cadence'
import { movementOf } from './movement'
import { chartWeekDueOn } from './schedule'
import type { FindChartAddress } from './source'

/**
 * Reading the archive Waveger owns.
 *
 * Everything here answers from Postgres alone. No route reaches back to the
 * Chart Compiler to serve a visitor: a Chart Week is fetched once, by
 * ingestion, and read from our own rows for ever after (ADR 0002).
 */

export interface ArchivedChart {
  slug: string
  name: string
  positionCount: number
}

export async function findChart(
  db: Kysely<Database>,
  slug: string,
): Promise<ArchivedChart | null> {
  const chart = await db
    .selectFrom('chart')
    .select(['slug', 'name', 'position_count'])
    .where('slug', '=', slug)
    .executeTakeFirst()

  return chart === undefined
    ? null
    : { slug: chart.slug, name: chart.name, positionCount: chart.position_count }
}

/**
 * The `FindChartAddress` an adapter is built with, bound to this database.
 *
 * The one place a Chart's address at the Compiler leaves Postgres. Both
 * adapters take it, so neither carries its own copy of which Chart is which —
 * a duplicate nothing would have kept in step, and whose disagreement would
 * show up as the wrong Chart being fetched rather than as an error.
 *
 * Its own query rather than a field on `ArchivedChart`, because the two are
 * asked for by different callers at different moments: ingestion wants the
 * Chart to judge a week against, an adapter wants an address to build a
 * request from, and neither has any use for the other's half.
 */
export const chartAddresses =
  (db: Kysely<Database>): FindChartAddress =>
  async (slug) => {
    const chart = await db
      .selectFrom('chart')
      .select(['compiler_slug', 'compiler_chart_id'])
      .where('slug', '=', slug)
      .executeTakeFirst()

    return chart === undefined
      ? null
      : { slug: chart.compiler_slug, chartId: chart.compiler_chart_id }
  }

/**
 * The Chart Weeks Waveger holds with every Entry on them (`CONTEXT.md`),
 * earliest first.
 *
 * The whole definition of Held, in one place, and it takes the Chart because
 * only the Chart says how many Entries "every" is. A Chart Week row with fewer
 * under it is not Held: to a visitor it is a week Waveger does not have.
 *
 * Deliberately never asked of `ingestion_run`. A week that was fetched and
 * refused has runs and no Entries; reading the runs would call it Held, decline
 * to fetch it again, and leave that hole in the archive for ever.
 */
export async function heldChartWeeks(
  db: Kysely<Database>,
  chart: ArchivedChart,
  date?: string,
): Promise<string[]> {
  let held = db
    .selectFrom('chart_week')
    .leftJoin('entry', 'entry.chart_week_id', 'chart_week.id')
    .select('chart_week.week_date')
    .where('chart_week.chart_slug', '=', chart.slug)
    // Safe to group by the date rather than the row because `chart_week` is
    // unique on (chart_slug, week_date) and the slug is already filtered, so
    // one date here is one Chart Week and never two Charts' worth of Entries.
    .groupBy('chart_week.week_date')
    // Postgres counts in bigint, so this is compared in the database rather
    // than in JavaScript: the pg driver hands a bigint back as a string, and
    // `'100' === 100` is the sort of false that never announces itself.
    .having((eb) =>
      eb(eb.fn.count('entry.position'), '=', chart.positionCount),
    )
    .orderBy('chart_week.week_date', 'asc')

  if (date !== undefined) held = held.where('chart_week.week_date', '=', date)

  return (await held.execute()).map((week) => week.week_date)
}

/** Whether Waveger holds this one Chart Week, by the definition above. */
export async function isChartWeekHeld(
  db: Kysely<Database>,
  date: string,
  chart: ArchivedChart,
): Promise<boolean> {
  return (await heldChartWeeks(db, chart, date)).length === 1
}

export interface ArchiveHealth {
  /** Null until the Chart has been reached for at all: nothing is claimed yet. */
  span: { from: string; to: string } | null
  held: string[]
  missing: string[]
}

/**
 * Whether the archive is whole: what it claims, what it has, what it owes.
 *
 * The Span runs from the earliest Chart Week this Chart has been reached for to
 * the Chart Week due now (`CONTEXT.md`). Both ends are deliberate, and both are
 * the end that is easy to get wrong.
 *
 * It starts at the earliest week *reached for* rather than the earliest one
 * Held, so that a week which was fetched and never landed still counts as owed.
 * Held weeks alone would make the Span retreat past exactly the losses it
 * exists to report: a backfill whose oldest week came back half-scraped would
 * start the Span after the loss and call the archive clean, and a deployment
 * whose first runs all failed would report holding nothing and Missing nothing,
 * which is what a healthy new archive looks like too. ADR 0002 puts that at
 * about one run in five.
 *
 * It ends at the week *due* rather than the last one Held for the mirror
 * reason. Measured only between the weeks it has, an archive nobody has added
 * to for a month is not full of holes, it is merely short — and short is
 * invisible to anything that looks between the weeks it holds.
 *
 * The cost of reaching back to what was asked for is that a mistyped date is
 * loud: a hand request for 1926-07-31 puts every week since in `missing`. That
 * is the right way round. A wrong answer that is obviously wrong gets fixed,
 * and the run history says in one line where the date came from; a Span that
 * quietly stops short of a hole is a hole nobody ever hears about, and ADR 0002
 * makes that one permanent.
 */
export async function archiveHealth(
  db: Kysely<Database>,
  chart: ArchivedChart,
  now: Date,
): Promise<ArchiveHealth> {
  const [held, reached] = await Promise.all([
    heldChartWeeks(db, chart),
    reachedForWeeks(db, chart),
  ])
  if (reached === null) return { span: null, held: [], missing: [] }

  // The later of the two, so the Span always contains everything it reports. A
  // week reached for beyond the one due — a Friday backfilled before the
  // Saturday cron fires — would otherwise leave `to` behind `from` entirely.
  const due = chartWeekDueOn(now)
  const span = {
    from: reached.first,
    to: reached.last > due ? reached.last : due,
  }
  const isHeld = new Set(held)

  return {
    span,
    held,
    missing: chartWeeksFrom(span.from, span.to).filter(
      (week) => !isHeld.has(week),
    ),
  }
}

/**
 * The first and last Chart Week this Chart has been reached for, held or not.
 *
 * Both tables, because they answer different halves of it: `chart_week` has the
 * weeks that landed, `ingestion_run` the ones that were tried. A week that was
 * refused every time it was fetched appears only in the second, and it is
 * precisely the week the Span must not start after.
 *
 * Compared as strings, which is safe for exactly one reason worth stating: an
 * ISO date sorts lexicographically the same way it sorts chronologically.
 */
async function reachedForWeeks(
  db: Kysely<Database>,
  chart: ArchivedChart,
): Promise<{ first: string; last: string } | null> {
  const [weeks, runs] = await Promise.all([
    db
      .selectFrom('chart_week')
      .select((eb) => [
        eb.fn.min<string | null>('week_date').as('first'),
        eb.fn.max<string | null>('week_date').as('last'),
      ])
      .where('chart_slug', '=', chart.slug)
      .executeTakeFirst(),
    db
      .selectFrom('ingestion_run')
      .select((eb) => [
        eb.fn.min<string | null>('week_date').as('first'),
        eb.fn.max<string | null>('week_date').as('last'),
      ])
      .where('chart_slug', '=', chart.slug)
      .executeTakeFirst(),
  ])

  // `min` over no rows is null, not an absent row, so both halves can be null
  // even though both queries always return one row.
  const first = earlierOf(weeks?.first, runs?.first)
  const last = laterOf(weeks?.last, runs?.last)

  return first === undefined || last === undefined ? null : { first, last }
}

const earlierOf = (...dates: (string | null | undefined)[]) =>
  known(dates).sort().at(0)

const laterOf = (...dates: (string | null | undefined)[]) =>
  known(dates).sort().at(-1)

const known = (dates: (string | null | undefined)[]): string[] =>
  dates.filter((date): date is string => date !== null && date !== undefined)

/**
 * The most recently held Chart Week, or null when Waveger holds none.
 *
 * "Most recent" is by the Chart Compiler's published date and not by when
 * Waveger fetched it, so backfilling an old week never changes what the front
 * page shows.
 *
 * The archive has one Chart today and the spec keeps the product that way, so
 * this takes no Chart: the week it finds names its own Chart in the response.
 * A second Chart makes this a parameter, which is an additive change.
 *
 * Movement and exits come from the same place the week does. Both are derived
 * here, at read time, by joining the archive to itself one Chart Week back —
 * there is no movement column and no backfill job, so correcting a past week
 * fixes its neighbour on the next read. The two joins are the same fact read in
 * opposite directions: a Song on this week and not the last one is a debut, and
 * a Song on the last one and not this is an exit.
 *
 * Both joins match on the Song, so both depend on a Song appearing at most once
 * in a Chart Week. Entries are keyed on Chart Week and Position, which does not
 * say that — `validateChartWeek` does, by refusing a week that names one Song
 * twice. Without it this join would return an Entry once per duplicate and a
 * hundred-Position week would read as more than a hundred Entries.
 */
export async function latestChartWeek(
  db: Kysely<Database>,
): Promise<ChartWeek | null> {
  const week = await db
    .selectFrom('chart_week')
    .innerJoin('chart', 'chart.slug', 'chart_week.chart_slug')
    .select(['chart_week.id', 'chart_week.week_date', 'chart.slug', 'chart.name'])
    .orderBy('chart_week.week_date', 'desc')
    .limit(1)
    .executeTakeFirst()

  if (week === undefined) return null

  const previous = {
    chart: week.slug,
    date: previousChartWeekDate(week.week_date),
  }

  const entries = await db
    .selectFrom('entry')
    .innerJoin('song', 'song.id', 'entry.song_id')
    .leftJoin('chart_week as previous_week', (join) =>
      join
        .on('previous_week.chart_slug', '=', previous.chart)
        .on('previous_week.week_date', '=', previous.date),
    )
    .leftJoin('entry as previous_entry', (join) =>
      join
        .onRef('previous_entry.chart_week_id', '=', 'previous_week.id')
        .onRef('previous_entry.song_id', '=', 'entry.song_id'),
    )
    .select([
      'entry.position',
      'song.title',
      'song.artist',
      'entry.peak_position',
      'entry.weeks_on_chart',
      // Both nullable, and for different reasons: the first is null when
      // Waveger holds no previous Chart Week, the second when it holds one the
      // Song was not on. That is the difference between unknown and a debut,
      // and it survives all the way to `movementOf` rather than being flattened
      // here into a single "no previous Position".
      'previous_week.id as previous_week_id',
      'previous_entry.position as previous_position',
    ])
    .where('entry.chart_week_id', '=', week.id)
    .orderBy('entry.position', 'asc')
    .execute()

  return {
    chart: { slug: week.slug, name: week.name },
    date: week.week_date,
    entries: entries.map((entry) => ({
      position: entry.position,
      title: entry.title,
      artist: entry.artist,
      peakPosition: entry.peak_position,
      weeksOnChart: entry.weeks_on_chart,
      movement: movementOf(
        entry.position,
        entry.previous_week_id === null
          ? { held: false }
          : { held: true, position: entry.previous_position },
      ),
    })),
    exits: await exitsFrom(db, week.id, previous),
  }
}

/**
 * The Songs that left: the same self-join, read the other way round.
 *
 * An exit is the absence of an Entry, so there is no Entry row to return and
 * none is invented. What comes back is the Song and the Position it last held.
 *
 * The previous Chart Week is identified by date rather than by an id passed in,
 * which is what makes the not-held case need no branch: no such week means no
 * rows, and a week nobody holds is a week nothing left.
 */
async function exitsFrom(
  db: Kysely<Database>,
  heldWeekId: string,
  previous: ChartWeekId,
): Promise<ChartExit[]> {
  const gone = await db
    .selectFrom('chart_week as previous_week')
    .innerJoin(
      'entry as previous_entry',
      'previous_entry.chart_week_id',
      'previous_week.id',
    )
    .innerJoin('song', 'song.id', 'previous_entry.song_id')
    .select(['song.title', 'song.artist', 'previous_entry.position'])
    .where('previous_week.chart_slug', '=', previous.chart)
    .where('previous_week.week_date', '=', previous.date)
    .where(({ not, exists, selectFrom }) =>
      not(
        exists(
          selectFrom('entry')
            .select('entry.song_id')
            .where('entry.chart_week_id', '=', heldWeekId)
            .whereRef('entry.song_id', '=', 'previous_entry.song_id'),
        ),
      ),
    )
    .orderBy('previous_entry.position', 'asc')
    .execute()

  return gone.map((song) => ({
    title: song.title,
    artist: song.artist,
    previousPosition: song.position,
  }))
}

export interface ArchivedRun {
  chart: string
  /** The Chart Week the run was for, which is not when it ran. */
  date: string
  status: IngestionRunStatus
  /** Why the run held nothing. Null exactly when it succeeded. */
  failure: string | null
  /**
   * Which `ChartSource` answered. Null only for runs that predate the archive
   * recording it — every one of those was the Apify actor, and saying so here
   * would be inventing the record rather than reading it.
   */
  source: string | null
  flags: IngestionFlag[]
  /**
   * Whether the run's raw payload was kept, which is what makes a week
   * replayable against changed parsing without paying to fetch it again. The
   * payload itself is not served: it is a hundred records, and no caller has
   * asked for one yet.
   */
  payloadStored: boolean
  ranAt: Date
}

export interface RunHistoryQuery {
  chart: string
  /** One Chart Week's runs. Omitted, the history covers the whole Chart. */
  date?: string
  limit: number
}

/**
 * Ingestion runs, most recent first.
 *
 * Ordered by when each ran and not by the week it was for, because the question
 * this answers is what ingestion has been doing lately — a run repairing a week
 * from last year belongs at the top of that, next to the failure that prompted
 * it.
 */
export async function ingestionRuns(
  db: Kysely<Database>,
  query: RunHistoryQuery,
): Promise<ArchivedRun[]> {
  let history = db
    .selectFrom('ingestion_run')
    .select([
      'chart_slug',
      'week_date',
      'status',
      'failure',
      'source',
      'flags',
      'ran_at',
    ])
    .select((eb) => eb('payload', 'is not', null).as('payload_stored'))
    .where('chart_slug', '=', query.chart)
    .orderBy('ran_at', 'desc')
    .limit(query.limit)

  if (query.date !== undefined) {
    history = history.where('week_date', '=', query.date)
  }

  return (await history.execute()).map((run) => ({
    chart: run.chart_slug,
    date: run.week_date,
    status: run.status,
    failure: run.failure,
    source: run.source,
    flags: run.flags,
    payloadStored: Boolean(run.payload_stored),
    ranAt: run.ran_at,
  }))
}
