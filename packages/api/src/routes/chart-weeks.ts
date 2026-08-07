import { createRoute, type RouteHandler } from '@hono/zod-openapi'
import { apiErrorSchema, chartWeekSchema } from '@waveger/domain'
import { latestChartWeek } from '../chart/archive'
import { errorBody, type ApiEnv } from '../context'

export const latestChartWeekRoute = createRoute({
  method: 'get',
  path: '/chart-weeks/latest',
  tags: ['Charts'],
  summary: 'The most recently held Chart Week',
  description:
    'The most recently published Chart Week Waveger holds, as a ranked list ' +
    'from Position 1 down, with each Entry\'s movement since the previous ' +
    'Chart Week and the Songs that left it. Served from Waveger\'s own ' +
    'archive: reading it never reaches back to the Chart Compiler. Public and ' +
    'unauthenticated.',
  responses: {
    200: {
      description:
        'The whole Chart Week, in Position order, with its exits. Movement is ' +
        '`unknown` throughout when Waveger holds no previous Chart Week.',
      content: { 'application/json': { schema: chartWeekSchema } },
    },
    404: {
      description:
        'Waveger holds no Chart Week at all. An empty archive rather than a ' +
        'missing path, so a client can say so instead of rendering nothing.',
      content: { 'application/json': { schema: apiErrorSchema } },
    },
  },
})

export const latestChartWeekHandler: RouteHandler<
  typeof latestChartWeekRoute,
  ApiEnv
> = async (c) => {
  const week = await latestChartWeek(c.get('db'))

  if (week === null) {
    return c.json(
      errorBody('no_chart_week', 'Waveger holds no Chart Week yet.'),
      404,
    )
  }

  // Parsed, not merely typed: the served body is checked against the same
  // schema the OpenAPI document is generated from, so the two cannot drift.
  return c.json(chartWeekSchema.parse(week), 200)
}
