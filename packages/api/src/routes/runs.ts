import { createRoute, z, type RouteHandler } from '@hono/zod-openapi'
import { apiErrorSchema } from '@waveger/domain'
import { findChart, ingestionRuns } from '../chart/archive'
import { ingestionFlagSchema } from '../chart/validate'
import { unknownChart, type ApiEnv } from '../context'

/**
 * What happened every time ingestion ran.
 *
 * A Chart Week Waveger does not hold needs an explanation, and this is where the
 * operator reads it: when each run was, which Chart Week it was for, whether it
 * succeeded, why it did not, what it flagged, and whether its payload was kept
 * for a replay. An operator route, like `/api/internal/ingest`, and no part of
 * the public contract (ADR 0011).
 *
 * The Chart Week is optional because the two questions are asked in different
 * orders. Someone repairing a week they already know about names it; someone who
 * has just been told by `GET /archive` that the archive has a hole does not yet
 * know which week to ask about, and reads the history to find out.
 */

/** Enough to see what ingestion has been doing without serving the backfill. */
const DEFAULT_HISTORY = 100

const runQuerySchema = z.object({
  /** A Chart's slug, e.g. `uk-singles`. */
  chart: z.string().min(1),
  /** One Chart Week. Omitted, the history covers the whole Chart. */
  date: z.iso.date().optional(),
  /**
   * Coerced because a query string carries no numbers. Capped as well as
   * defaulted: the backfill alone puts thousands of Chart Weeks behind this,
   * and an operator route is not the place to discover the response size limit.
   */
  limit: z.coerce.number().int().positive().max(1_000).default(DEFAULT_HISTORY),
})

const runSchema = z.object({
  chart: z.string(),
  /** The Chart Week this run was for, which is not when it ran. */
  date: z.iso.date(),
  /**
   * How it ended. The two failures are kept apart because they send an operator
   * to different places: `rejected` is a source that answered with something
   * that is not a Chart Week, `unavailable` a source that did not answer at all
   * — a fetch that failed every attempt, or one that said trying again would
   * not help.
   */
  status: z.enum(['succeeded', 'rejected', 'unavailable']),
  /** Why the run held nothing. Null exactly when it succeeded. */
  failure: z.string().nullable(),
  /**
   * Which source answered, in its own name for itself — `official-charts` for
   * the Chart Compiler's own API, `apify` for the actor retained behind the
   * same seam (ADR 0017). Which one a deployment is wired to is a deploy-time
   * fact, so this is the only place a week fetched during a fallback can be
   * told from every other week afterwards.
   *
   * Null for runs that predate the archive recording it.
   */
  source: z.string().nullable(),
  /**
   * What the run noticed and did not act on, chiefly an Artist over the Chart
   * Compiler's three-per-week cap. Evidence about the source rather than
   * something for Waveger to correct, so it is reported and never enforced.
   */
  flags: z.array(ingestionFlagSchema),
  payloadStored: z.boolean(),
  ranAt: z.iso.datetime(),
})

export const runsRoute = createRoute({
  method: 'get',
  path: '/runs',
  tags: ['Operator'],
  summary: 'The ingestion run history',
  request: { query: runQuerySchema },
  responses: {
    200: {
      description:
        'Ingestion runs, most recent first — for one Chart Week when the ' +
        'request names one, and for the whole Chart when it does not.',
      content: {
        'application/json': {
          schema: z.object({ runs: z.array(runSchema) }),
        },
      },
    },
    404: {
      description: 'No such Chart.',
      content: { 'application/json': { schema: apiErrorSchema } },
    },
    422: {
      description: 'The request did not name a Chart.',
      content: { 'application/json': { schema: apiErrorSchema } },
    },
  },
})

export const runsHandler: RouteHandler<typeof runsRoute, ApiEnv> = async (c) => {
  const query = c.req.valid('query')

  // Asked first so that a Chart nobody has says so, rather than answering with
  // the empty history a Chart that has simply never run would have.
  const chart = await findChart(c.get('db'), query.chart)
  if (chart === null) return c.json(unknownChart(query.chart), 404)

  const runs = await ingestionRuns(c.get('db'), query)

  return c.json(
    { runs: runs.map((run) => ({ ...run, ranAt: run.ranAt.toISOString() })) },
    200,
  )
}
