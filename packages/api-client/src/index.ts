import {
  apiErrorSchema,
  apiStatusSchema,
  type ApiStatus,
} from '@waveger/domain'

/**
 * The client both apps call the API through.
 *
 * It is deliberately hand-written and tiny. ADR 0006 defers generated clients
 * until a binary exists in the field that cannot be recalled; until then the
 * contract is small enough to state once, here, and the value of doing so by
 * hand is that responses are *parsed* rather than cast. A native build lives
 * for months against a web deployment that moves weekly, so a response that
 * has quietly changed shape should fail here, loudly, and not three screens
 * later as `undefined`.
 */

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

export interface ApiClient {
  getStatus(options?: { signal?: AbortSignal }): Promise<ApiStatus>
}

export interface CreateApiClientOptions {
  /** Origin the API is served from, e.g. `https://waveger.vercel.app`. */
  baseUrl: string
  /** Injectable for tests; defaults to the platform `fetch`. */
  fetch?: typeof globalThis.fetch
}

export function createApiClient(options: CreateApiClientOptions): ApiClient {
  const origin = options.baseUrl.replace(/\/+$/, '')
  const doFetch = options.fetch ?? globalThis.fetch

  async function request(path: string, signal?: AbortSignal): Promise<unknown> {
    const response = await doFetch(`${origin}/api/v1${path}`, {
      headers: { accept: 'application/json' },
      signal,
    })
    const body: unknown = await response.json().catch(() => null)

    if (!response.ok) {
      const parsed = apiErrorSchema.safeParse(body)
      throw new ApiError(
        response.status,
        parsed.success ? parsed.data.error : 'unexpected_response',
        parsed.success
          ? parsed.data.message
          : `${origin}${path} responded ${response.status}`,
      )
    }

    return body
  }

  return {
    async getStatus(callOptions) {
      return apiStatusSchema.parse(
        await request('/status', callOptions?.signal),
      )
    },
  }
}
