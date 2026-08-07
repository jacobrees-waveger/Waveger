import type { ChartMovement } from '@waveger/domain'

/**
 * How far an Entry moved, and what "the previous Chart Week" means.
 *
 * Nothing here touches the archive — this is the reading of a self-join, not
 * the join itself (see `archive.ts`). Keeping it separate is what makes the
 * archive boundary a case you can see: `unknown` is a fact about a *week*,
 * arrived at because Waveger holds no predecessor, and the only way it can be
 * mistaken for a debut is if someone writes that mistake down here.
 */

/**
 * A Chart publishes on a fixed weekly cadence (`CONTEXT.md`), so the Chart Week
 * before 2026-07-31 is 2026-07-24 and nothing else — deliberately not "the most
 * recent week we hold that is older than this one".
 *
 * Movement measured across a gap is wrong rather than absent, and wrong is the
 * one that cannot be spotted afterwards. ADR 0012 has the argument, what it
 * costs, and why this constant lives here rather than on the `chart` row.
 */
const CHART_WEEK_DAYS = 7

/** The published date of the Chart Week before this one. */
export function previousChartWeekDate(date: string): string {
  const previous = new Date(`${date}T00:00:00Z`)
  previous.setUTCDate(previous.getUTCDate() - CHART_WEEK_DAYS)
  return previous.toISOString().slice(0, 10)
}

/** Where a Song stood in the previous Chart Week, as far as Waveger can tell. */
export type PreviousStanding =
  /** Waveger holds no previous Chart Week at all. */
  | { held: false }
  /** It holds one. `position` is null when the Song had no Entry in it. */
  | { held: true; position: number | null }

/**
 * One Entry's movement, from its Position and where its Song stood last week.
 *
 * The order of the three questions is the whole of it. Whether Waveger holds
 * the previous week is asked before whether the Song was on it, because a Song
 * cannot be shown to be new to a Chart Week nobody has.
 */
export function movementOf(
  position: number,
  previous: PreviousStanding,
): ChartMovement {
  if (!previous.held) return { kind: 'unknown' }
  if (previous.position === null) return { kind: 'debut' }
  if (previous.position === position) return { kind: 'non-mover' }

  // Position 1 is the top, so a climb is a decrease and the subtraction runs
  // the way it does to make Positions *gained* the positive number.
  return { kind: 'moved', positionsGained: previous.position - position }
}
