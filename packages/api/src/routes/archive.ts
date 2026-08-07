import { createRoute, z, type RouteHandler } from '@hono/zod-openapi'
import { apiErrorSchema } from '@waveger/domain'
import { archiveHealth, findChart } from '../chart/archive'
import { unknownChart, type ApiEnv } from '../context'

/**
 * Whether the archive is whole.
 *
 * Which Chart Weeks Waveger holds, and which it should hold and does not. ADR
 * 0002 puts the actor at a 19% failure rate and makes the archive unbuyable
 * after the fact, so a hole nobody notices for a month is a hole for good —
 * this is the route that stops it being nobody's job to look.
 *
 * An operator route, like `/api/internal/ingest`, and no part of the public
 * contract (ADR 0011). `GET /runs` is its companion: this says where the holes
 * are, that says what happened at one.
 */

const archiveQuerySchema = z.object({
  /** A Chart's slug, e.g. `uk-singles`. */
  chart: z.string().min(1),
})

const archiveHealthSchema = z.object({
  chart: z.string(),
  /**
   * What this Chart's archive claims: from the earliest Chart Week it has been
   * reached for to the one due now. Null until it has been reached for at all —
   * an empty archive is new rather than broken, and claims nothing to be short
   * of.
   */
  span: z.object({ from: z.iso.date(), to: z.iso.date() }).nullable(),
  /**
   * Every Chart Week Held, earliest first. Uncapped, unlike the run history:
   * this list is bounded by the calendar rather than by how often anything ran,
   * so the backfill puts a few thousand dates in it and nothing puts more. An
   * operator asking whether the archive is whole is owed the whole answer.
   */
  held: z.array(z.iso.date()),
  /**
   * Every Chart Week inside the Span that is not Held, earliest first. Empty is
   * the healthy answer, and the only one.
   */
  missing: z.array(z.iso.date()),
})

export const archiveRoute = createRoute({
  method: 'get',
  path: '/archive',
  tags: ['Operator'],
  summary: 'Whether the archive is whole',
  request: { query: archiveQuerySchema },
  responses: {
    200: {
      description: 'What this Chart archive holds, and what it owes.',
      content: { 'application/json': { schema: archiveHealthSchema } },
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

export const archiveHandler: RouteHandler<typeof archiveRoute, ApiEnv> = async (
  c,
) => {
  const { chart: slug } = c.req.valid('query')

  const chart = await findChart(c.get('db'), slug)
  if (chart === null) return c.json(unknownChart(slug), 404)

  // The clock is read here and passed down, so nothing under `archive.ts` has
  // an opinion about what "now" is — the same shape `scheduledIngestHandler`
  // uses, for the same reason.
  const health = await archiveHealth(c.get('db'), chart, new Date())

  return c.json({ chart: chart.slug, ...health }, 200)
}
