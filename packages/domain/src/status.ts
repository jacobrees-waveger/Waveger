import { z } from 'zod'

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
  })
  // `id` names the schema in the OpenAPI document instead of inlining it.
  .meta({ id: 'ApiStatus' })

export type ApiStatus = z.infer<typeof apiStatusSchema>

/** The shape every non-2xx response takes. */
export const apiErrorSchema = z
  .object({
    /** One of `apiErrorCodes` — but see below for why this is not an enum. */
    error: z.string(),
    message: z.string(),
  })
  .meta({ id: 'ApiError' })

export type ApiError = z.infer<typeof apiErrorSchema>

/**
 * The codes the API emits today.
 *
 * Deliberately a TypeScript union rather than a Zod enum on the wire. A native
 * binary in the field parses these responses months after it shipped, and
 * `z.enum` would make *adding* a code a breaking change for it — exactly the
 * additive-only evolution ADR 0006 forbids breaking. So the server is held to
 * the list and the client is not.
 */
export const apiErrorCodes = [
  'not_found',
  'invalid_request',
  'database_unreachable',
  'internal_error',
] as const

export type ApiErrorCode = (typeof apiErrorCodes)[number]
