import { createRoute, z, type RouteHandler } from '@hono/zod-openapi'
import { apiErrorSchema, chartWeekIdSchema } from '@waveger/domain'
import { ingestChartWeek } from '../chart/ingest'
import { ingestionFlagSchema } from '../chart/validate'
import { errorBody, type ApiEnv } from '../context'

/**
 * Ingestion is triggered by an HTTP request, not by a script or a worker.
 *
 * That is the shape it needs anyway once WAV-11 puts it on a schedule, and it
 * means ingestion and reading share the one test seam. It is an operator route
 * and not part of the public `/api/v1` contract, so it is absent from the
 * OpenAPI document by construction (ADR 0011): nothing here is promised to any
 * client. The shared secret that will guard it arrives with the schedule.
 */

const ingestionReportSchema = z.object({
  status: z.literal('succeeded'),
  chart: z.string(),
  date: z.iso.date(),
  /** Entries now held for this Chart Week. */
  entries: z.number().int(),
  /** What the run noticed and did not act on. */
  flags: z.array(ingestionFlagSchema),
})

export const ingestRoute = createRoute({
  method: 'post',
  path: '/ingest',
  tags: ['Operator'],
  summary: 'Ingest one Chart Week',
  request: {
    body: {
      required: true,
      content: { 'application/json': { schema: chartWeekIdSchema } },
    },
  },
  responses: {
    200: {
      description: 'The Chart Week is held.',
      content: { 'application/json': { schema: ingestionReportSchema } },
    },
    404: {
      description: 'No such Chart.',
      content: { 'application/json': { schema: apiErrorSchema } },
    },
    422: {
      description: 'The request did not name a Chart Week.',
      content: { 'application/json': { schema: apiErrorSchema } },
    },
    502: {
      description:
        'The source failed, or answered with something that is not a whole ' +
        'Chart Week. Either way the archive is untouched and the run is ' +
        'recorded as failed.',
      content: { 'application/json': { schema: apiErrorSchema } },
    },
  },
})

export const ingestHandler: RouteHandler<typeof ingestRoute, ApiEnv> = async (
  c,
) => {
  const id = c.req.valid('json')
  const outcome = await ingestChartWeek(c.get('db'), c.get('chartSource'), id)

  switch (outcome.kind) {
    case 'succeeded':
      return c.json(
        ingestionReportSchema.parse({
          status: 'succeeded',
          chart: id.chart,
          date: id.date,
          entries: outcome.entries,
          flags: outcome.flags,
        }),
        200,
      )

    case 'rejected':
      return c.json(
        errorBody(
          'chart_week_rejected',
          `${id.chart} ${id.date} ${outcome.reason}, so none of it was held.`,
        ),
        502,
      )

    case 'unavailable':
      return c.json(errorBody('chart_source_unavailable', outcome.reason), 502)

    case 'unknown_chart':
      return c.json(
        errorBody('not_found', `Waveger has no Chart called ${id.chart}.`),
        404,
      )
  }
}
