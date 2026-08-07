import type { ChartWeekId } from '@waveger/domain'
import previousWeek from './fixtures/uk-singles-2026-07-24.json'
import verifiedRun from './fixtures/uk-singles-2026-07-31.json'
import {
  ChartSourceError,
  type ChartSource,
  type SourceChartWeek,
  type SourceEntry,
} from './source'

/**
 * A `ChartSource` that replays stored runs of the Apify actor.
 *
 * It ships with two adjacent Chart Weeks, and they are not equally real.
 *
 * 2026-07-31 is the verified run ADR 0002 checked by hand — 100 Positions, no
 * gaps or duplicates, the three-per-artist cap holding exactly. Stored
 * verbatim, so the payload ingestion sees here is the payload it will see in
 * production, including the actor's two known defects.
 *
 * 2026-07-24 is **hand-authored**, and it is here so that movement has anything
 * to be derived from: a lone Chart Week has no predecessor, so every Entry on
 * it reads as `unknown` and nothing ever leaves. Its Positions were chosen to
 * agree with what the verified run says about them — the 37 climbers and 11
 * non-movers sit where that run's `last_week` puts them, and the 11 Songs it
 * marks `is_new` are simply absent. The other 41 Positions and all 11 exiting
 * Songs are invented, because `last_week` is null for every descending Entry
 * and there was nothing to recover.
 *
 * Its own records carry `last_week: null` and `is_new: false` throughout: this
 * week is not a run of the actor and states nothing about the week before it.
 * Nothing reads either field, so nothing notices. Both weeks go once WAV-11
 * puts the live actor behind this same interface, at which point nothing above
 * the seam changes.
 *
 * Tests pass their own runs in to describe weeks the archive should refuse.
 */
export function createFixtureChartSource(
  runs: StoredRuns = {
    'uk-singles/2026-07-24': previousWeek,
    'uk-singles/2026-07-31': verifiedRun,
  },
): ChartSource {
  return {
    async fetchChartWeek(id: ChartWeekId): Promise<SourceChartWeek> {
      const records = runs[`${id.chart}/${id.date}`]
      if (records === undefined) {
        throw new ChartSourceError(
          `No stored run for ${id.chart} ${id.date}. This source replays the ` +
            'runs it was given and cannot fetch a Chart Week.',
        )
      }
      return { entries: records.map(toSourceEntry), payload: records }
    },
  }
}

/** Runs keyed by the Chart Week they are of, e.g. `uk-singles/2026-07-31`. */
export type StoredRuns = Readonly<Record<string, readonly unknown[]>>

/**
 * One actor record, read for the five fields an Entry is made of.
 *
 * Deliberately tolerant: a record missing a title yields a blank one rather
 * than an error, so that a half-scraped week is rejected as a week — visibly,
 * in one place, with the whole payload kept — instead of blowing up here.
 *
 * Two fields are read by nothing, on purpose (ADR 0002). `last_week` is null
 * for every descending Entry, so it reports the direction of a fall but never
 * its magnitude; WAV-10 derives movement from Waveger's own archive instead.
 * `label` is always null, as the actor's own schema admits.
 */
function toSourceEntry(record: unknown): SourceEntry {
  const fields: Record<string, unknown> =
    typeof record === 'object' && record !== null
      ? (record as Record<string, unknown>)
      : {}

  return {
    position: asNumber(fields.rank),
    title: asString(fields.title),
    artist: asString(fields.artist),
    peakPosition: asNumber(fields.peak_position),
    weeksOnChart: asNumber(fields.weeks_on_chart),
  }
}

const asString = (value: unknown): string =>
  typeof value === 'string' ? value : ''

const asNumber = (value: unknown): number =>
  typeof value === 'number' ? value : Number.NaN
