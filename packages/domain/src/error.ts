import { z } from 'zod'

/** The shape every non-2xx response takes, whatever route produced it. */
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
 * additive-only evolution ADR 0006 exists to protect. So the server is held to
 * the list and the client is not.
 */
const apiErrorCodes = [
  'not_found',
  'invalid_request',
  'database_unreachable',
  'internal_error',
  /**
   * The archive holds no Chart Week at all. Its own code rather than a plain
   * `not_found`, so a client can tell an empty archive — which both apps are
   * required to say out loud — from a path that does not exist.
   */
  'no_chart_week',
  /** A fetched Chart Week was not the whole week, so none of it was written. */
  'chart_week_rejected',
  /** The `ChartSource` itself failed. Nothing was fetched to judge. */
  'chart_source_unavailable',
] as const

export type ApiErrorCode = (typeof apiErrorCodes)[number]
