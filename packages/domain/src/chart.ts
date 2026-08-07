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
 * How far an Entry moved since the previous Chart Week.
 *
 * Four states, and they are four states rather than one number on purpose. A
 * debut and a non-mover are both "no places gained", and an Entry whose
 * predecessor Waveger simply does not hold is neither — collapsing any of them
 * into a 0 or a null makes the reader guess, and the guess a reader makes is
 * that an unknown is a debut. The archive's earliest Chart Week would then
 * render as a hundred brand-new Songs.
 *
 * Nothing here is stored. Movement is derived at read time by self-joining the
 * previous Chart Week (ADR 0002), so correcting or backfilling a past week
 * fixes its neighbours with no reprocessing step. The actor's own `last_week`
 * field is never read: it is null for every descending Entry, so it reports the
 * direction of a fall but never its magnitude.
 */
export const chartMovementSchema = z
  .discriminatedUnion('kind', [
    z.object({
      kind: z.literal('moved'),
      /**
       * Positions gained. Position 1 is the top, so a climb is a *decrease* in
       * Position and this is `previousPosition - position`: positive climbed,
       * negative fell. Never zero — that is `non-mover`.
       */
      positionsGained: z
        .number()
        .int()
        .refine(
          (positions) => positions !== 0,
          'Gaining no Positions is `non-mover`.',
        ),
    }),
    /** On the Chart last week, at this same Position. */
    z.object({ kind: z.literal('non-mover') }),
    /** Not on the Chart last week. */
    z.object({ kind: z.literal('debut') }),
    /** Waveger holds no previous Chart Week, so it cannot say. */
    z.object({ kind: z.literal('unknown') }),
  ])
  .meta({ id: 'ChartMovement' })

export type ChartMovement = z.infer<typeof chartMovementSchema>

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
 * `movement`, by contrast, is Waveger's own: derived from its archive rather
 * than reported to it.
 */
export const chartEntrySchema = z
  .object({
    position: z.number().int().positive(),
    title: z.string(),
    artist: z.string(),
    peakPosition: z.number().int(),
    weeksOnChart: z.number().int(),
    movement: chartMovementSchema,
  })
  .meta({ id: 'ChartEntry' })

export type ChartEntry = z.infer<typeof chartEntrySchema>

/**
 * A Song that was on the Chart last week and is not on it this week.
 *
 * The other half of the same self-join, read in the opposite direction. An exit
 * has no Entry — it is precisely the absence of one — so none is invented for
 * it and it carries no Position, only the Position it last held.
 */
export const chartExitSchema = z
  .object({
    title: z.string(),
    artist: z.string(),
    /** Where it stood in the previous Chart Week. */
    previousPosition: z.number().int().positive(),
  })
  .meta({ id: 'ChartExit' })

export type ChartExit = z.infer<typeof chartExitSchema>

/**
 * One published edition of a Chart, ranked from Position 1 down.
 *
 * `exits` are part of the week and not a route of their own, because they are
 * the same fact as the movement on the Entries — what changed since last week —
 * and a visitor who is shown one without the other is shown half the week.
 * Ordered by the Position each Song last held, so they read like the Chart they
 * have just left. Empty when Waveger holds no previous Chart Week, which is the
 * same circumstance every Entry reports as `unknown`.
 */
export const chartWeekSchema = z
  .object({
    chart: z.object({ slug: z.string(), name: z.string() }),
    date: z.iso.date(),
    entries: z.array(chartEntrySchema),
    exits: z.array(chartExitSchema),
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
