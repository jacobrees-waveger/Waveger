import { createRoute, z, type RouteHandler } from '@hono/zod-openapi'
import { chartWeekIdSchema } from '@waveger/domain'
import { ingestionRuns } from '../chart/archive'
import { ingestionFlagSchema } from '../chart/validate'
import type { ApiEnv } from '../context'

/**
 * What happened when ingestion ran for one Chart Week.
 *
 * A Chart Week Waveger does not hold needs an explanation, and this is where
 * the operator reads it: whether the run succeeded, why it did not, what it
 * flagged, and whether its payload was kept for a replay. An operator route,
 * like `/api/internal/ingest`, and no part of the public contract.
 */

const runSchema = z.object({
  status: z.enum(['succeeded', 'failed']),
  failure: z.string().nullable(),
  flags: z.array(ingestionFlagSchema),
  payloadStored: z.boolean(),
  ranAt: z.iso.datetime(),
})

export const runsRoute = createRoute({
  method: 'get',
  path: '/runs',
  tags: ['Operator'],
  summary: 'Ingestion runs for one Chart Week',
  request: { query: chartWeekIdSchema },
  responses: {
    200: {
      description: 'Every run for that Chart Week, most recent first.',
      content: {
        'application/json': {
          schema: z.object({ runs: z.array(runSchema) }),
        },
      },
    },
  },
})

export const runsHandler: RouteHandler<typeof runsRoute, ApiEnv> = async (c) => {
  const runs = await ingestionRuns(c.get('db'), c.req.valid('query'))

  return c.json(
    {
      runs: runs.map((run) => ({
        status: run.status,
        failure: run.failure,
        flags: run.flags,
        payloadStored: run.payloadStored,
        ranAt: run.ranAt.toISOString(),
      })),
    },
    200,
  )
}
