import { z } from 'zod'
import { chartSchema } from './chart'

/**
 * The response of `GET /api/v1/status`. Proves, in one round trip, that the
 * API is running, that it can reach Postgres, and which migrations that
 * database has had applied to it.
 */
export const apiStatusSchema = z
  .object({
    service: z.literal('waveger-api'),
    version: z.literal('v1'),
    database: z.object({
      /** Only ever `true`: an unreachable database answers 503, not 200. */
      reachable: z.literal(true),
      /** Applied migration names, oldest first. */
      migrations: z.array(z.string()),
    }),
    /** The Charts this deployment knows how to consume. */
    charts: z.array(chartSchema),
  })
  // `id` names the schema in the OpenAPI document instead of inlining it.
  .meta({ id: 'ApiStatus' })

export type ApiStatus = z.infer<typeof apiStatusSchema>

/** The shape every non-2xx response takes. */
export const apiErrorSchema = z
  .object({
    error: z.string(),
    message: z.string(),
  })
  .meta({ id: 'ApiError' })

export type ApiError = z.infer<typeof apiErrorSchema>
