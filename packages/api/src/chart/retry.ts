import type { ChartWeekId } from '@waveger/domain'
import {
  ChartSourceError,
  type ChartSource,
  type ResumeCursor,
  type SourceChartWeek,
} from './source'

/**
 * Fetching a Chart Week more than once before giving up.
 *
 * ADR 0002 measured the actor at 25 succeeded to 6 failed over thirty days — a
 * 19% failure rate — so a single failed fetch would otherwise cost a Chart
 * Week, and ADR 0012 makes that cost two weeks of movement rather than one.
 * Vercel does not retry a cron invocation either, so the next attempt has to
 * happen inside this one.
 *
 * It lives above the `ChartSource` seam rather than inside the implementation
 * for two reasons. Every source gets retried, including ones written years from
 * now; and a policy behind the seam could not be exercised without a real
 * actor, where this one is driven through the route with a fake that fails on
 * purpose. What stays behind the seam is the *resuming*: the cursor is opaque
 * here (`ResumeCursor`), so this file carries no idea that an actor exists.
 *
 * Only a failed fetch is retried. A fetch that answers with a week the archive
 * then refuses is not — the actor charges per record and a half-scraped run
 * that completed has nothing left to resume, so a second run would pay in full
 * to be told the same thing.
 */

export interface RetryPolicy {
  /** Attempts in total, including the first. One means no retry. */
  attempts: number
  /** How long to wait before the given retry, which is 1-based. */
  backoffMs: (retry: number) => number
  /**
   * Waits. Injected rather than called directly so the tests can drive the
   * whole loop — retry, resume and exhaustion — without also driving a clock.
   */
  sleep: (ms: number) => Promise<void>
}

/**
 * Two seconds, then four.
 *
 * The failure being waited out is an actor run that fell over, not a rate
 * limit, so the wait is there to let a transient upstream problem pass rather
 * than to back away from a queue. It doubles because the second failure is
 * evidence the first was not a blip, and it stays short because all of this
 * happens inside one function invocation that Vercel will end at 300 seconds.
 */
export const exponentialBackoffMs = (retry: number): number =>
  2_000 * 2 ** (retry - 1)

export const defaultRetryPolicy: RetryPolicy = {
  attempts: 3,
  backoffMs: exponentialBackoffMs,
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
}

/**
 * The Chart Week, or the last failure — never a partial answer.
 *
 * Every attempt after the first is told where its predecessor stopped, so a
 * source that can resume does, and one that cannot simply ignores it. The
 * error that comes out of an exhausted retry is the last one, with the count
 * of attempts added: an operator reading the run log needs to know that
 * "the actor run failed" happened three times and not once.
 */
export async function fetchChartWeekWithRetry(
  source: ChartSource,
  id: ChartWeekId,
  policy: RetryPolicy,
): Promise<SourceChartWeek> {
  let resumeFrom: ResumeCursor | undefined

  for (let attempt = 1; ; attempt += 1) {
    try {
      return await source.fetchChartWeek(id, resumeFrom)
    } catch (cause) {
      // A source that says trying again cannot help is believed, and the count
      // is left off the message: it happened once, and once is the truth.
      if (cause instanceof ChartSourceError && cause.permanent) throw cause
      if (attempt >= policy.attempts) throw exhausted(cause, attempt)

      resumeFrom = cause instanceof ChartSourceError ? cause.resumeFrom : undefined
      await policy.sleep(policy.backoffMs(attempt))
    }
  }
}

/**
 * The last failure, said once. The attempt count is part of the message rather
 * than a field because the only thing that reads it is a person looking at the
 * run log, and `ingestion_run.failure` is where they will be looking.
 */
function exhausted(cause: unknown, attempts: number): ChartSourceError {
  const reason = cause instanceof Error ? cause.message : String(cause)
  const tried = attempts === 1 ? '1 attempt' : `${attempts} attempts`

  return new ChartSourceError(`${reason} (after ${tried})`)
}
