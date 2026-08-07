/**
 * The Chart's weekly cadence, and the arithmetic that follows from it.
 *
 * A Chart publishes on a fixed weekly cadence (`CONTEXT.md`), which is what
 * makes "the previous Chart Week" and "the Chart Weeks between these two dates"
 * definite things rather than search results. Both readings live here so that
 * one constant decides both: movement is derived against the week seven days
 * back (ADR 0012) and a Missing week is found by walking the same seven days,
 * and a cadence that meant two different things to those two would report
 * Missing weeks where movement saw none.
 */

/**
 * ADR 0012 has the argument for this being a constant rather than a search, and
 * what a Missing Chart Week costs. A second Chart on a different cadence would
 * move it onto the `chart` row, which is an additive change to a table that
 * already carries the Chart's own `position_count` for the same reason.
 */
const CHART_WEEK_DAYS = 7

/** The published date of the Chart Week before this one. */
export const previousChartWeekDate = (date: string): string =>
  shiftedByWeeks(date, -1)

/**
 * Every Chart Week from `to` back to `from`, earliest first, inclusive of both
 * ends when both sit on the cadence.
 *
 * Counted back from `to` rather than forward from `from`, which decides what
 * happens when the two are not a whole number of weeks apart. `to` is the Chart
 * Week due now and is therefore always on the cadence; `from` is read out of the
 * archive, and nothing in the schema requires a `week_date` to be. Anchoring on
 * the end that is known-good means one mistyped date can cost the week it names
 * and no more. Anchoring on `from` would have shifted the whole walk onto the
 * wrong day, reporting every real Chart Week as Missing and — because the
 * partial week at the end is dropped — quietly omitting `to` itself, which is
 * the week whose absence says the schedule has stopped.
 *
 * Empty when `to` is earlier than `from`, which is how an archive that has
 * reached for nothing reports nothing Missing.
 */
export function chartWeeksFrom(from: string, to: string): string[] {
  const weeks = Math.floor(
    (asInstant(to) - asInstant(from)) / (CHART_WEEK_DAYS * MS_PER_DAY),
  )

  return weeks < 0
    ? []
    : Array.from({ length: weeks + 1 }, (_, step) =>
        shiftedByWeeks(to, step - weeks),
      )
}

const MS_PER_DAY = 24 * 60 * 60 * 1000

/**
 * A calendar date is never an instant, so the arithmetic is done in UTC and the
 * result sliced back to a date — the same reason `week_date` is a string all
 * the way down and `client.ts` parses DATE as one.
 */
function shiftedByWeeks(date: string, weeks: number): string {
  const shifted = new Date(asInstant(date))
  shifted.setUTCDate(shifted.getUTCDate() + weeks * CHART_WEEK_DAYS)
  return shifted.toISOString().slice(0, 10)
}

const asInstant = (date: string): number => Date.parse(`${date}T00:00:00Z`)
