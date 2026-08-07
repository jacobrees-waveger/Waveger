import type { Database, IngestionFlag } from '@waveger/db'
import type { ChartWeekId } from '@waveger/domain'
import type { Kysely, Transaction } from 'kysely'
import { findChart, type ArchivedChart } from './archive'
import { songFingerprint } from './fingerprint'
import type { ChartSource, SourceEntry } from './source'
import { validateChartWeek } from './validate'

/**
 * Fetch, judge, persist — the whole of ingestion.
 *
 * Every path through it ends in a row in `ingestion_run`, including the ones
 * that write nothing else, because a Chart Week Waveger does not hold needs an
 * explanation. Nothing enters the archive that has not been judged as a
 * complete week first.
 */

export type IngestionOutcome =
  | { kind: 'succeeded'; entries: number; flags: IngestionFlag[] }
  /** The source answered, but not with a Chart Week. Nothing was written. */
  | { kind: 'rejected'; reason: string }
  /** The source did not answer at all. */
  | { kind: 'unavailable'; reason: string }
  /** No such Chart. There is nothing to record the run against. */
  | { kind: 'unknown_chart' }

export async function ingestChartWeek(
  db: Kysely<Database>,
  source: ChartSource,
  id: ChartWeekId,
): Promise<IngestionOutcome> {
  const chart = await findChart(db, id.chart)
  if (chart === null) return { kind: 'unknown_chart' }

  let fetched
  try {
    fetched = await source.fetchChartWeek(id)
  } catch (cause) {
    const reason = cause instanceof Error ? cause.message : String(cause)
    // Nothing was fetched, so there is nothing to store and nothing to flag.
    await recordFailedRun(db, id, reason, { payload: undefined, flags: [] })
    return { kind: 'unavailable', reason }
  }

  const week = validateChartWeek(fetched.entries, chart)
  if (!week.ok) {
    await recordFailedRun(db, id, week.reason, {
      payload: fetched.payload,
      flags: week.flags,
    })
    return { kind: 'rejected', reason: week.reason }
  }

  // One transaction: either the whole week and its run are there, or neither
  // is. A rejected week never reaches this far, so the archive cannot hold a
  // partial one whatever happens between here and the commit.
  await db.transaction().execute(async (trx) => {
    const heldWeek = await upsertChartWeek(trx, id)
    const songs = await upsertSongs(trx, week.entries)
    await upsertEntries(trx, heldWeek, week.entries, songs)

    await trx
      .insertInto('ingestion_run')
      .values({
        chart_slug: id.chart,
        week_date: id.date,
        status: 'succeeded',
        failure: null,
        flags: JSON.stringify(week.flags),
        payload: asJson(fetched.payload),
      })
      .execute()
  })

  return { kind: 'succeeded', entries: week.entries.length, flags: week.flags }
}

/**
 * Re-ingesting a Chart Week Waveger already holds leaves it as it was.
 *
 * Every write below is an upsert onto the key the archive already enforces, so
 * a rerun writes the same rows over themselves. A Chart Week keeps its
 * identity, which matters because Entries point at it.
 */
async function upsertChartWeek(
  trx: Transaction<Database>,
  id: ChartWeekId,
): Promise<string> {
  const held = await trx
    .insertInto('chart_week')
    .values({ chart_slug: id.chart, week_date: id.date })
    .onConflict((oc) =>
      oc
        .columns(['chart_slug', 'week_date'])
        // Nothing to change: the update exists so the row comes back either
        // way, where `do nothing` would return no row on the second run.
        .doUpdateSet((eb) => ({ week_date: eb.ref('excluded.week_date') })),
    )
    .returning('id')
    .executeTakeFirstOrThrow()

  return held.id
}

/** Fingerprint to Song id, for every Song this week names. */
async function upsertSongs(
  trx: Transaction<Database>,
  entries: readonly SourceEntry[],
): Promise<Map<string, string>> {
  const songs = new Map<string, { fingerprint: string; title: string; artist: string }>()
  for (const entry of entries) {
    const fingerprint = songFingerprint(entry.artist, entry.title)
    if (!songs.has(fingerprint)) {
      songs.set(fingerprint, {
        fingerprint,
        title: entry.title,
        artist: entry.artist,
      })
    }
  }

  const written = await trx
    .insertInto('song')
    .values([...songs.values()])
    .onConflict((oc) =>
      oc
        .column('fingerprint')
        // The credit as first reported is kept. A later week that spells it
        // differently is the same Song by fingerprint, and rewriting the title
        // to that week's spelling would make a Song's name depend on when it
        // was last read.
        .doUpdateSet((eb) => ({ fingerprint: eb.ref('excluded.fingerprint') })),
    )
    .returning(['id', 'fingerprint'])
    .execute()

  return new Map(written.map((song) => [song.fingerprint, song.id]))
}

async function upsertEntries(
  trx: Transaction<Database>,
  heldWeek: string,
  entries: readonly SourceEntry[],
  songs: ReadonlyMap<string, string>,
): Promise<void> {
  await trx
    .insertInto('entry')
    .values(
      entries.map((entry) => ({
        chart_week_id: heldWeek,
        position: entry.position,
        song_id: songIdOf(songs, entry),
        peak_position: entry.peakPosition,
        weeks_on_chart: entry.weeksOnChart,
      })),
    )
    .onConflict((oc) =>
      oc.columns(['chart_week_id', 'position']).doUpdateSet((eb) => ({
        song_id: eb.ref('excluded.song_id'),
        peak_position: eb.ref('excluded.peak_position'),
        weeks_on_chart: eb.ref('excluded.weeks_on_chart'),
      })),
    )
    .execute()
}

function songIdOf(
  songs: ReadonlyMap<string, string>,
  entry: SourceEntry,
): string {
  const id = songs.get(songFingerprint(entry.artist, entry.title))
  if (id === undefined) {
    throw new Error(`No Song was written for Position ${entry.position}`)
  }
  return id
}

/**
 * A run that wrote nothing still happened, and says why.
 *
 * Outside the transaction that would have held the week, so the record of the
 * failure survives whatever the failure was.
 */
async function recordFailedRun(
  db: Kysely<Database>,
  id: ChartWeekId,
  failure: string,
  found: { payload: unknown; flags: IngestionFlag[] },
): Promise<void> {
  await db
    .insertInto('ingestion_run')
    .values({
      chart_slug: id.chart,
      week_date: id.date,
      status: 'failed',
      failure,
      // A week can breach the Compiler's cap and still be half-scraped. This
      // run is the only place that sighting survives, so it is kept even
      // though the week itself was not.
      flags: JSON.stringify(found.flags),
      payload: asJson(found.payload),
    })
    .execute()
}

/** Null only when there was nothing to store, never `"undefined"`. */
const asJson = (payload: unknown): string | null =>
  payload === undefined ? null : JSON.stringify(payload)
