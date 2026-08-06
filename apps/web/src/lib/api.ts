import { createApiClient, type ApiClient } from '@waveger/api-client'
import { headers } from 'next/headers'

/**
 * The shared client, pointed at this same deployment.
 *
 * A Server Component could reach the Hono app directly, but then the web app
 * and the native app would be exercising different code paths and only one of
 * them would be tested. Both go over HTTP, through the same client.
 */
export async function serverApiClient(): Promise<ApiClient> {
  const requestHeaders = await headers()
  const host = requestHeaders.get('host') ?? 'localhost:3000'
  const forwardedProtocol = requestHeaders.get('x-forwarded-proto')
  const protocol =
    forwardedProtocol ?? (host.startsWith('localhost') ? 'http' : 'https')

  return createApiClient({ baseUrl: `${protocol}://${host}` })
}
