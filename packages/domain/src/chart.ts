import { z } from 'zod'

/**
 * How a Chart Week is named: the Chart it belongs to and the Chart Compiler's
 * published date. Every route that addresses one week takes this pair, and so
 * does the `ChartSource` seam chart data enters through.
 */
export const chartWeekIdSchema = z
  .object({
    /** A Chart's slug, e.g. `uk-singles`. */
    chart: z.string().min(1),
    /** The published date, e.g. `2026-07-31`. A calendar date, not an instant. */
    date: z.iso.date(),
  })
  .meta({ id: 'ChartWeekId' })

export type ChartWeekId = z.infer<typeof chartWeekIdSchema>

/**
 * One Entry as a visitor sees it: a Song at a Position.
 *
 * `peakPosition` and `weeksOnChart` are the Chart Compiler's own figures,
 * passed through as reported — they are what tells a new arrival from a
 * long-running fixture at a glance. Reported is the operative word: they are
 * whole numbers and nothing more is claimed of them, because Waveger consumes
 * Charts and never compiles them, and a contract stricter than what the
 * archive is willing to hold would fail on the way out instead.
 *
 * Movement is not here: it is derived at read time and arrives with WAV-10.
 */
export const chartEntrySchema = z
  .object({
    position: z.number().int().positive(),
    title: z.string(),
    artist: z.string(),
    peakPosition: z.number().int(),
    weeksOnChart: z.number().int(),
  })
  .meta({ id: 'ChartEntry' })

export type ChartEntry = z.infer<typeof chartEntrySchema>

/** One published edition of a Chart, ranked from Position 1 down. */
export const chartWeekSchema = z
  .object({
    chart: z.object({ slug: z.string(), name: z.string() }),
    date: z.iso.date(),
    entries: z.array(chartEntrySchema),
  })
  .meta({ id: 'ChartWeek' })

export type ChartWeek = z.infer<typeof chartWeekSchema>

/**
 * The Chart Compiler's published date, as a person would say it.
 *
 * Shared rather than written twice. ADR 0001 shares logic and never UI, and
 * this is logic: both apps have to name the same Chart Week the same way, and
 * two copies of a date format is exactly the drift that ADR names as this
 * architecture's failure mode. Fixed to `en-GB` because the Chart is the UK
 * Official Singles Chart and its dates are the Compiler's, not the reader's.
 */
export function publishedDate(date: string): string {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  })
}
