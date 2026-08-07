import { createHash, timingSafeEqual } from 'node:crypto'
import type { MiddlewareHandler } from 'hono'
import { errorBody, type ApiEnv } from './context'

/**
 * The shared secret in front of `/api/internal/*`.
 *
 * ADR 0011 keeps the operator routes outside the versioned contract and out of
 * the OpenAPI document, and says plainly that absent from the document must not
 * be read as unreachable. This is what makes them unreachable. Until it existed,
 * the only thing standing in front of a route that writes to production
 * Postgres was Vercel Authentication — a deployment setting, not a decision this
 * repository had made, and it was turned off on 2026-08-07.
 *
 * `POST /api/internal/ingest` is the reason for the urgency. It writes an
 * `ingestion_run` row on every call including the ones that hold nothing, so an
 * open route is unbounded writes; and once WAV-11 puts the live Apify actor
 * behind the `ChartSource`, each call is $0.20 against an account capped at
 * $5/month (ADR 0002). Roughly 25 requests would exhaust the month.
 */

/**
 * `Authorization: Bearer <secret>`, which is what Vercel Cron sends by itself.
 *
 * That is the whole reason for the scheme. Vercel invokes a scheduled path with
 * `Authorization: Bearer ${CRON_SECRET}` when that variable is set, so WAV-11
 * puts ingestion on a schedule by writing a cron entry and nothing else. A
 * header of our own would have meant a second secret and a hand-rolled caller.
 */
const BEARER = /^Bearer (.+)$/

/**
 * Fail closed. A deployment with no secret refuses the operator routes rather
 * than serving them to anyone, because the failure this guards against is
 * precisely the one where nobody noticed the variable was missing.
 */
export function requireOperatorSecret(
  secret: string | undefined,
): MiddlewareHandler<ApiEnv> {
  return async (c, next) => {
    if (secret === undefined || secret === '') {
      return c.json(
        errorBody(
          'operator_unconfigured',
          'This deployment holds no operator secret, so its operator routes ' +
            'are closed. Set CRON_SECRET on the Vercel project.',
        ),
        503,
      )
    }

    const offered = BEARER.exec(c.req.header('authorization') ?? '')?.[1]
    if (offered === undefined || !matches(offered, secret)) {
      return c.json(
        errorBody(
          'unauthorised',
          'Operator routes need the shared secret as `Authorization: Bearer`.',
        ),
        401,
      )
    }

    await next()
  }
}

/**
 * Compared through SHA-256 so the comparison is constant time *and* constant
 * length. `timingSafeEqual` throws on differing lengths, so comparing the raw
 * strings would need a length check first — which is itself a branch on the
 * secret, and leaks its length to anyone willing to time the difference.
 */
function matches(offered: string, secret: string): boolean {
  return timingSafeEqual(digestOf(offered), digestOf(secret))
}

const digestOf = (value: string): Buffer =>
  createHash('sha256').update(value, 'utf8').digest()
