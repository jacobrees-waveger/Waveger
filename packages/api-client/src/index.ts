import {
  apiErrorSchema,
  apiStatusSchema,
  chartWeekSchema,
  type ApiStatus,
  type ChartWeek,
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

export class ApiRequestError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message)
    this.name = 'ApiRequestError'
  }
}

/** One line fit to show a person, whatever went wrong. */
export function describeError(error: unknown): string {
  return error instanceof ApiRequestError
    ? `${error.code}: ${error.message}`
    : String(error)
}

export interface ApiClient {
  getStatus(options?: { signal?: AbortSignal }): Promise<ApiStatus>
  /**
   * The most recently held Chart Week, or null when Waveger holds none.
   *
   * An empty archive is a state both apps are required to say out loud, not a
   * failure — so it arrives as null rather than as a thrown error. Only the
   * API's own `no_chart_week` maps to it: a 404 from anywhere else is still a
   * 404, and a misconfigured base URL does not quietly read as an empty chart.
   */
  getLatestChartWeek(options?: {
    signal?: AbortSignal
  }): Promise<ChartWeek | null>
}

export interface CreateApiClientOptions {
  /** Origin the API is served from, e.g. `https://waveger.vercel.app`. */
  baseUrl: string
  /**
   * Sent with every request, on top of `accept`.
   *
   * A caller can be authorised in a way the client has no business knowing
   * about: the web app forwards the viewer's `cookie` so a Server Component
   * rendering a protected preview deployment carries the same authorisation
   * the viewer already holds, and native will carry a bearer token (ADR 0007).
   * The client stays ignorant of both and just puts them on the wire.
   */
  headers?: Readonly<Record<string, string>>
}

export function createApiClient(options: CreateApiClientOptions): ApiClient {
  const origin = options.baseUrl.replace(/\/+$/, '')

  async function request(path: string, signal?: AbortSignal): Promise<unknown> {
    const response = await fetch(`${origin}/api/v1${path}`, {
      headers: { accept: 'application/json', ...options.headers },
      signal,
    })
    const body: unknown = await response.json().catch(() => null)

    if (!response.ok) {
      const parsed = apiErrorSchema.safeParse(body)
      throw new ApiRequestError(
        response.status,
        parsed.success ? parsed.data.error : 'unexpected_response',
        parsed.success
          ? parsed.data.message
          : `${origin}/api/v1${path} responded ${response.status}`,
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

    async getLatestChartWeek(callOptions) {
      try {
        return chartWeekSchema.parse(
          await request('/chart-weeks/latest', callOptions?.signal),
        )
      } catch (error) {
        if (error instanceof ApiRequestError && error.code === 'no_chart_week') {
          return null
        }
        throw error
      }
    },
  }
}
