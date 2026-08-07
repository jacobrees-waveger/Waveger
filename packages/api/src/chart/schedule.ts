/**
 * Which Chart Week the schedule is for.
 *
 * The cron entry carries a Chart and nothing else, because a date written into
 * `vercel.json` would be a date that goes stale the following week. So the
 * schedule asks this instead, and asking is the whole of it: ingestion is
 * idempotent and a Chart Week already Held is not fetched again, so a schedule
 * that fires twice, or fires having already caught up, costs nothing.
 */

/**
 * The UK Official Singles Chart publishes on a Friday and is dated that Friday.
 *
 * Verified rather than assumed: the ADR 0002 run was made on Thursday
 * 2026-08-06 with no date given — "the current week only", by the actor's own
 * input schema — and came back dated 2026-07-31, the Friday before it. So the
 * Chart Week current at any moment is the one dated the most recent Friday.
 *
 * Sunday is 0 in `getUTCDay`, so Friday is 5. UTC throughout, because Vercel
 * runs cron expressions in UTC and a Chart Week is a calendar date rather than
 * an instant — the same reason `week_date` is a string all the way down.
 */
const CHART_PUBLISHED_ON = 5

/**
 * The most recent Friday on or before `now`.
 *
 * On the Friday itself this returns that day, which is a week that may not be
 * published yet: the Chart goes live on Friday evening. That is why the cron
 * entry fires on a Saturday (ADR 0013) rather than being handled with a
 * special case here — a Chart Week that has not been published is a fetch that
 * fails, and ingestion already knows what to do with one of those.
 */
export function chartWeekDueOn(now: Date): string {
  const due = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  )
  const sincePublication = (due.getUTCDay() - CHART_PUBLISHED_ON + 7) % 7

  due.setUTCDate(due.getUTCDate() - sincePublication)
  return due.toISOString().slice(0, 10)
}
