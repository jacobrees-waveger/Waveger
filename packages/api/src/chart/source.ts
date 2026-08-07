import type { ChartWeekId } from '@waveger/domain'

/**
 * The one route by which chart data enters Waveger.
 *
 * ADR 0002 makes the Apify actor load-bearing and unproven, and names one
 * narrow seam as the mitigation: a replacement is an adapter, not a rewrite.
 * So a `ChartSource` takes a Chart Week identifier and either returns the whole
 * week or fails. It knows nothing about Postgres, movement or Apple Music, and
 * nothing above it knows where a week came from — WAV-11 swaps the fixture for
 * the actor and changes nothing else.
 */
export interface ChartSource {
  fetchChartWeek(id: ChartWeekId): Promise<SourceChartWeek>
}

/**
 * One Entry exactly as the source reported it, and no more trustworthy than
 * that.
 *
 * The fields are typed but not judged: a title may be blank and a Position may
 * be absurd, because a source that repaired its own payload would hide the
 * half-scraped run that validation exists to reject. Whether these amount to a
 * Chart Week is `validateChartWeek`'s question, not a source's.
 */
export interface SourceEntry {
  position: number
  title: string
  artist: string
  peakPosition: number
  weeksOnChart: number
}

export interface SourceChartWeek {
  entries: SourceEntry[]
  /**
   * Untouched, as received. Stored against the run so a week can be replayed
   * against changed parsing without paying the actor for the fetch again.
   */
  payload: unknown
}

/** A source that could not answer. Recorded as a failed run, never as a week. */
export class ChartSourceError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ChartSourceError'
  }
}
