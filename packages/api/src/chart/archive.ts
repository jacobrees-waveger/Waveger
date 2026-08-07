import type { Database, IngestionFlag } from '@waveger/db'
import type { ChartWeek, ChartWeekId } from '@waveger/domain'
import type { Kysely } from 'kysely'

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
 * The most recently held Chart Week, or null when Waveger holds none.
 *
 * "Most recent" is by the Chart Compiler's published date and not by when
 * Waveger fetched it, so backfilling an old week never changes what the front
 * page shows.
 *
 * The archive has one Chart today and the spec keeps the product that way, so
 * this takes no Chart: the week it finds names its own Chart in the response.
 * A second Chart makes this a parameter, which is an additive change.
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

  const entries = await db
    .selectFrom('entry')
    .innerJoin('song', 'song.id', 'entry.song_id')
    .select([
      'entry.position',
      'song.title',
      'song.artist',
      'entry.peak_position',
      'entry.weeks_on_chart',
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
    })),
  }
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
