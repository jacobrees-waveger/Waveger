import type { ChartWeekId } from '@waveger/domain'

/**
 * The one route by which chart data enters Waveger.
 *
 * ADR 0002 makes the Apify actor load-bearing and unproven, and names one
 * narrow seam as the mitigation: a replacement is an adapter, not a rewrite.
 * So a `ChartSource` takes a Chart Week identifier and either returns the whole
 * week or fails. It knows nothing about Postgres, movement or Apple Music, and
 * nothing above it knows where a week came from.
 */
export interface ChartSource {
  /**
   * What this source calls itself, recorded against every run it answers.
   *
   * Waveger has two working adapters and a deployment is wired to one of them
   * (ADR 0017), which is a fact about the deploy that would otherwise leave no
   * trace: a Chart Week fetched during a fallback would read afterwards exactly
   * like every other week. It lives on the source rather than on its answer
   * because a run that got no answer needs it most.
   */
  readonly name: string

  /**
   * @param resumeFrom - what a previous attempt at this same Chart Week got as
   * far as, when it failed and could say. A source is free to ignore it and
   * start again; one that honours it must still return the *whole* week, not
   * only the part it had left to fetch.
   */
  fetchChartWeek(
    id: ChartWeekId,
    resumeFrom?: ResumeCursor,
  ): Promise<SourceChartWeek>
}

/**
 * How the Chart Compiler addresses a Chart Waveger has its own name for.
 *
 * Reference data on the Chart's own row rather than a table in here, so that
 * adding a Chart is a migration and not a deploy — and so that two adapters
 * fetching the same Chart cannot disagree about which Chart that is.
 */
export interface ChartAddress {
  /** The Compiler's slug, e.g. `singles-chart` for Waveger's `uk-singles`. */
  slug: string
  /** The Compiler's own numeric id for the Chart, e.g. 7501. */
  chartId: number
}

/**
 * A Chart's address at the Compiler, looked up by Waveger's slug.
 *
 * Injected rather than read, because a source knows nothing about Postgres and
 * this is the one thing it needs out of it. Null is a Chart this deployment's
 * archive does not have, which no source can fetch a week of.
 */
export type FindChartAddress = (chart: string) => Promise<ChartAddress | null>

/**
 * How far a failed fetch got, in the source's own terms.
 *
 * Opaque on purpose: it travels out of a failed fetch, through the retry, and
 * back into the next one without anybody in between looking inside it. That is
 * what lets retrying resume a half-finished fetch — which for the Apify actor
 * is the difference between paying for a hundred records and paying for the
 * forty it had not reached (ADR 0002) — while leaving the retry itself with no
 * knowledge that an actor exists at all.
 */
export type ResumeCursor = Readonly<Record<string, unknown>>

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
  /**
   * Where a retry should pick this fetch up, when the source can say. Undefined
   * means start again — a source that cannot resume is not a source that cannot
   * be retried.
   */
  readonly resumeFrom: ResumeCursor | undefined

  /**
   * True when trying again cannot help: the source is misconfigured, not
   * unlucky. A missing token and a Chart the source does not serve are the same
   * answer three times over, and waiting six seconds to say it that way turns a
   * plain "APIFY_TOKEN is not set" into "…(after 3 attempts)", which reads like
   * a flaky actor and sends the operator to the wrong place.
   */
  readonly permanent: boolean

  constructor(
    message: string,
    options: { resumeFrom?: ResumeCursor; permanent?: boolean } = {},
  ) {
    super(message)
    this.name = 'ChartSourceError'
    this.resumeFrom = options.resumeFrom
    this.permanent = options.permanent ?? false
  }
}
