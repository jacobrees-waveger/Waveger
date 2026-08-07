import type { Database, IngestionFlag } from '@waveger/db'
import type { ChartExit, ChartWeek, ChartWeekId } from '@waveger/domain'
import type { Kysely } from 'kysely'
import { movementOf, previousChartWeekDate } from './movement'

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
 * Whether Waveger holds this Chart Week with every Entry on it (`CONTEXT.md`).
 *
 * The whole definition, in one place, and it takes the Chart because only the
 * Chart says how many Entries "every" is. A Chart Week row with fewer under it
 * is not Held: to a visitor it is a week Waveger does not have.
 *
 * Deliberately never asked of `ingestion_run`. A week that was fetched and
 * refused has runs and no Entries; reading the runs would call it Held, decline
 * to fetch it again, and leave that hole in the archive for ever.
 */
export async function isChartWeekHeld(
  db: Kysely<Database>,
  id: ChartWeekId,
  chart: ArchivedChart,
): Promise<boolean> {
  const held = await db
    .selectFrom('chart_week')
    .leftJoin('entry', 'entry.chart_week_id', 'chart_week.id')
    .select((eb) => eb.fn.count<string>('entry.position').as('entries'))
    .where('chart_week.chart_slug', '=', id.chart)
    .where('chart_week.week_date', '=', id.date)
    .executeTakeFirst()

  // `count` comes back as a string: Postgres counts in bigint, and the pg
  // driver will not silently narrow one to a JS number.
  return Number(held?.entries ?? 0) === chart.positionCount
}

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
  status: 'succeeded' | 'failed'
  /** Why the run held nothing. Null when it succeeded. */
  failure: string | null
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

/** Every run for one Chart Week, most recent first. */
export async function ingestionRuns(
  db: Kysely<Database>,
  id: ChartWeekId,
): Promise<ArchivedRun[]> {
  const runs = await db
    .selectFrom('ingestion_run')
    .select(['status', 'failure', 'flags', 'ran_at'])
    .select((eb) => eb('payload', 'is not', null).as('payload_stored'))
    .where('chart_slug', '=', id.chart)
    .where('week_date', '=', id.date)
    .orderBy('ran_at', 'desc')
    .execute()

  return runs.map((run) => ({
    status: run.status,
    failure: run.failure,
    flags: run.flags,
    payloadStored: Boolean(run.payload_stored),
    ranAt: run.ran_at,
  }))
}
