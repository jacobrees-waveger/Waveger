import { createApi, createApifyChartSource } from '@waveger/api'
import { createDb } from '@waveger/db'
import { handle } from 'hono/vercel'

/**
 * The whole API, mounted inside the Next.js deployment (ADR 0006).
 *
 * This file is the only adapter between the two. Nothing above it imports
 * `next/*`, which is what keeps moving the API to its own deployment a swap of
 * this file rather than a rewrite.
 */

let api: ReturnType<typeof createApi> | undefined

function getApi() {
  if (api === undefined) {
    const connectionString = process.env.DATABASE_URL
    if (!connectionString) {
      throw new Error(
        'DATABASE_URL is not set. Run `vercel env pull .env.local`.',
      )
    }

    api = createApi({
      // The pooled connection string: every request runs in a serverless
      // function, so the pooler is doing the connection management (ADR 0008).
      // A small local pool on top of it keeps one function instance from
      // opening a connection per concurrent request.
      db: createDb({ connectionString, max: 5 }),
      // The only place that decides where chart data comes from — the whole
      // point of the `ChartSource` seam (ADR 0002). Everything that knows an
      // Apify actor exists is behind this call.
      chartSource: createApifyChartSource({ token: process.env.APIFY_TOKEN }),
      // Neither secret is thrown for when it is missing, unlike DATABASE_URL.
      // A deployment without them still serves the public chart: the operator
      // routes close, and a fetch fails and says why in the run log. That is
      // the safe direction — a misconfigured operator does not take the
      // website down with them.
      operatorSecret: process.env.CRON_SECRET,
    })
  }
  return api
}

const handler = (request: Request) => handle(getApi())(request)

export const GET = handler
export const POST = handler
export const PUT = handler
export const PATCH = handler
export const DELETE = handler
export const OPTIONS = handler
