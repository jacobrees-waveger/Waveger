import { createRoute, z, type RouteHandler } from '@hono/zod-openapi'
import {
  apiErrorSchema,
  chartWeekIdSchema,
  type ChartWeekId,
} from '@waveger/domain'
import type { Context } from 'hono'
import { ingestChartWeek, type IngestionOutcome } from '../chart/ingest'
import { chartWeekDueOn } from '../chart/schedule'
import { ingestionFlagSchema } from '../chart/validate'
import { errorBody, type ApiEnv } from '../context'

/**
 * Ingestion is triggered by an HTTP request, not by a script or a worker.
 *
 * It has two callers and they ask for different things. The schedule fires a
 * GET at a Chart and gets the Chart Week due now, because Vercel Cron sends a
 * GET and carries nothing else (ADR 0013). A person repairing a week the
 * schedule missed POSTs the week they mean, and may say `refetch` to fetch one
 * the archive already holds.
 *
 * Both are operator routes and no part of the public `/api/v1` contract, so
 * they are absent from the OpenAPI document by construction (ADR 0011) and
 * behind the shared secret — which is also what Vercel Cron sends by itself.
 */

const ingestionRequestSchema = chartWeekIdSchema.extend({
  /**
   * Fetch this Chart Week even though it is Held, replacing what the archive
   * has. Defaults to false, and is the only way to re-fetch a Held week: a
   * Chart Week can be Held and wrong, but the schedule runs weekly against an
   * actor that charges per record, so re-fetching has to be asked for.
   */
  refetch: z.boolean().default(false),
})

const scheduledRequestSchema = z.object({
  /** A Chart's slug, e.g. `uk-singles`. The cron entry names it in its path. */
  chart: z.string().min(1),
})

/**
 * What a run did. Two shapes, not one with an empty `flags`: a Chart Week that
 * was already Held did not run, so it has nothing to have noticed.
 */
const ingestionReportSchema = z.discriminatedUnion('status', [
  z.object({
    status: z.literal('succeeded'),
    chart: z.string(),
    date: z.iso.date(),
    /** Entries now held for this Chart Week. */
    entries: z.number().int(),
    /** What the run noticed and did not act on. */
    flags: z.array(ingestionFlagSchema),
  }),
  z.object({
    status: z.literal('already_held'),
    chart: z.string(),
    date: z.iso.date(),
    entries: z.number().int(),
  }),
])

const outcomes = {
  200: {
    description:
      'The Chart Week is held — either this run held it, or it was already ' +
      'Held and the source was never asked.',
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
      'The source failed every attempt, or answered with something that is ' +
      'not a whole Chart Week. Either way the archive is untouched and the ' +
      'run is recorded as failed.',
    content: { 'application/json': { schema: apiErrorSchema } },
  },
} as const

export const ingestRoute = createRoute({
  method: 'post',
  path: '/ingest',
  tags: ['Operator'],
  summary: 'Ingest one Chart Week',
  request: {
    body: {
      required: true,
      content: { 'application/json': { schema: ingestionRequestSchema } },
    },
  },
  responses: outcomes,
})

/**
 * The schedule's own route. A GET, taking the Chart in its path, because that
 * is the only shape Vercel Cron can send: no body, no query it would have to be
 * trusted to keep, and no date — a date in `vercel.json` is stale the week
 * after it is written.
 */
export const scheduledIngestRoute = createRoute({
  method: 'get',
  path: '/ingest/{chart}',
  tags: ['Operator'],
  summary: 'Ingest the Chart Week due now',
  request: { params: scheduledRequestSchema },
  responses: outcomes,
})

export const ingestHandler: RouteHandler<typeof ingestRoute, ApiEnv> = async (
  c,
) => {
  const { refetch, ...id } = c.req.valid('json')

  return report(
    c,
    id,
    await ingestChartWeek(c.get('db'), c.get('chartSource'), id, {
      retry: c.get('ingestionRetry'),
      refetch,
    }),
  )
}

export const scheduledIngestHandler: RouteHandler<
  typeof scheduledIngestRoute,
  ApiEnv
> = async (c) => {
  const id = {
    chart: c.req.valid('param').chart,
    date: chartWeekDueOn(new Date()),
  }

  return report(
    c,
    id,
    await ingestChartWeek(c.get('db'), c.get('chartSource'), id, {
      // Never `refetch`. The schedule fires weekly and Vercel may deliver the
      // same firing twice, so a week already Held has to cost nothing.
      retry: c.get('ingestionRetry'),
    }),
  )
}

/**
 * One outcome, one response, for both callers.
 *
 * `unavailable` and `rejected` are both 502 and both mean the archive is
 * untouched, but they are kept apart in the body: one says the source could not
 * answer, the other that it answered with something that is not a Chart Week,
 * and those send an operator to different places.
 */
function report(
  c: Context<ApiEnv>,
  id: ChartWeekId,
  outcome: IngestionOutcome,
) {
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

    case 'already_held':
      return c.json(
        ingestionReportSchema.parse({
          status: 'already_held',
          chart: id.chart,
          date: id.date,
          entries: outcome.entries,
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
