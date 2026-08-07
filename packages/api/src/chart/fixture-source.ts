import type { ChartWeekId } from '@waveger/domain'
import { toSourceEntry } from './actor-record'
import previousWeek from './fixtures/uk-singles-2026-07-24.json'
import verifiedRun from './fixtures/uk-singles-2026-07-31.json'
import {
  ChartSourceError,
  type ChartSource,
  type SourceChartWeek,
} from './source'

/**
 * A `ChartSource` that replays stored runs of the Apify actor.
 *
 * Both weeks it ships with are real runs, kept verbatim, so the payload
 * ingestion sees here is the payload it sees in production — including the
 * actor's two known defects. 2026-07-31 is the run ADR 0002 checked by hand:
 * 100 Positions, no gaps or duplicates, the three-per-artist cap holding
 * exactly. 2026-07-24 is the Chart Week before it, fetched by the live source
 * the day it was written, so that movement has a predecessor to be derived
 * from — a lone Chart Week has none, so every Entry on it reads as `unknown`
 * and nothing ever leaves.
 *
 * That earlier week was hand-authored until WAV-11, because `last_week` is null
 * for every descending Entry and there was no way to recover where a fall had
 * fallen from. The invention showed: the aggregate shape survived the swap
 * unchanged — 37 climbs, 41 falls, 11 non-movers, 11 debuts at the same
 * Positions — while the biggest fall of the week and all eleven exiting Songs
 * turned out to be different Songs entirely.
 *
 * This source is now for tests alone. A deployment fetches from the actor
 * (`apify-source.ts`), and tests pass their own runs in to describe weeks the
 * archive should refuse — 99 Entries, two Entries at one Position, a blank
 * title — which no real run produces and none of them should.
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
