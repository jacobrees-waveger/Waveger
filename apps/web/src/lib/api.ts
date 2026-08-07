import { createApiClient, type ApiClient } from '@waveger/api-client'
import { headers } from 'next/headers'

/**
 * The shared client, pointed at this same deployment.
 *
 * A Server Component could reach the Hono app directly, but then the web app
 * and the native app would be exercising different code paths and only one of
 * them would be tested. Both go over HTTP, through the same client.
 *
 * Going over HTTP means leaving the deployment and coming back, so the request
 * is re-checked at the edge on the way in. On a preview deployment that check
 * is Vercel Authentication, which answers 401 and renders every preview broken
 * — the viewer is signed in, but this fetch is a fresh anonymous request that
 * inherits nothing from them. Forwarding `cookie` is what makes it theirs
 * again, and is the pattern Next documents for exactly this. It is deliberately
 * not the automation bypass secret: that would hand the app a standing key to
 * disable its own protection, where the cookie grants it only what whoever is
 * looking at the page already has.
 */
export async function serverApiClient(): Promise<ApiClient> {
  const requestHeaders = await headers()
  const host = requestHeaders.get('host') ?? 'localhost:3000'
  const forwardedProtocol = requestHeaders.get('x-forwarded-proto')
  const protocol =
    forwardedProtocol ?? (host.startsWith('localhost') ? 'http' : 'https')
  const cookie = requestHeaders.get('cookie')

  return createApiClient({
    baseUrl: `${protocol}://${host}`,
    ...(cookie ? { headers: { cookie } } : {}),
  })
}
