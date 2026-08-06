import { z } from 'zod'

/**
 * A Chart — an externally compiled ranking of Songs, published on a fixed
 * weekly cadence. Waveger consumes Charts; it never compiles its own, so a
 * Chart is always identified by its Chart Compiler as well as its own name.
 *
 * See CONTEXT.md for the language and ADR 0002 for the sources.
 */
export const chartSchema = z
  .object({
    /** Stable, human-readable identifier. Ours, not the Chart Compiler's. */
    slug: z.string().min(1),
    /** The Chart's published name, as the Chart Compiler writes it. */
    name: z.string().min(1),
    /** The organisation that compiles and publishes it. */
    compiler: z.string().min(1),
  })
  // `id` names the schema in the OpenAPI document instead of inlining it.
  .meta({ id: 'Chart' })

export type Chart = z.infer<typeof chartSchema>
