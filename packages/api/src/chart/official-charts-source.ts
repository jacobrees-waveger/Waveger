import type { ChartWeekId } from '@waveger/domain'
import { toSourceEntry } from './chart-item'
import {
  ChartSourceError,
  type ChartAddress,
  type ChartSource,
  type FindChartAddress,
  type SourceChartWeek,
} from './source'

/**
 * Where chart data comes from: the Chart Compiler's own JSON API.
 *
 * ADR 0017 moves Waveger off the Apify actor and onto `ce-api`, the JSON
 * backend behind officialcharts.com's front end. It is free, it fails loudly,
 * and it carries things the actor never did. It is also undocumented,
 * unannounced and without a contract, and the mitigation for that is the
 * `ChartSource` seam: the actor stays implemented beside this file, so a
 * retreat is a line in `route.ts` rather than a rewrite.
 *
 * Three failure shapes, all measured against the live endpoint rather than
 * taken from the ADR — which describes only the third and describes it as the
 * only one. A chart id it does not have answers **500 with an HTML page**; a
 * date it does not publish answers **200 with a body-level redirect** to a date
 * it does; and a Chart Week it has answers the page. Every one of them is
 * caught below, and none of them can reach the archive as a week.
 *
 * Everything Waveger knows about that endpoint is in here. Nothing above the
 * seam knows a request was made at all, let alone to a host called `backstage`.
 */

/**
 * Written down rather than configured, for the same reason the actor's name is:
 * it is not a secret and not an environment, it is where this repository
 * decided its chart data comes from (ADR 0017), and it would change in a commit.
 */
const CE_API = 'https://backstage.officialcharts.com/ce-api'

/**
 * The block the Chart Week is in, among the several a page is built from.
 *
 * Found by name rather than by walking a path of array indices, because the
 * response is a page — a chart list, then "Hot right now", then a sidebar — and
 * the position of the chart within it is a layout decision at the far end of an
 * endpoint that changes without telling anyone.
 */
const CHART_LIST = 'drupal-block-chart-list'

/**
 * How long one request gets.
 *
 * The whole Chart Week arrives in one response and the measured ones are around
 * 150 KB, so this is not sized for the transfer — it is the point at which an
 * unanswered request stops holding the invocation open. Three attempts and two
 * backoffs have to finish inside the 300 seconds Vercel gives a function.
 */
const REQUEST_MS = 15_000

/**
 * Enough of `fetch` to make a request, and no more.
 *
 * A parameter so the tests can drive this adapter — the real one, building the
 * real path and reading a real captured response — without reaching the
 * Compiler. There is no second implementation of the parsing below to drift
 * from it.
 */
export type FetchLike = (
  url: string,
  init?: RequestInit,
) => Promise<Response>

export interface OfficialChartsSourceOptions {
  /** Where a Chart lives at the Compiler, out of the Chart's own row. */
  chartAddress: FindChartAddress
  fetch?: FetchLike
}

export function createOfficialChartsSource(
  options: OfficialChartsSourceOptions,
): ChartSource {
  // Bound, because `globalThis.fetch` pulled off the object and called bare
  // throws `Illegal invocation` in some runtimes.
  const fetch = options.fetch ?? ((url, init) => globalThis.fetch(url, init))

  return {
    name: 'official-charts',

    /**
     * The resume cursor is ignored, and the seam allows that in as many words:
     * a source is free to start again. There is nothing here to resume from. A
     * whole Chart Week arrives in one response, so a fetch either answered or
     * did not, and the retry above the seam simply asks again — which costs
     * nothing, unlike asking the actor again.
     */
    async fetchChartWeek(id: ChartWeekId): Promise<SourceChartWeek> {
      const address = await options.chartAddress(id.chart)
      if (address === null) {
        // Permanent: no amount of waiting gives this deployment a Chart its
        // archive does not have.
        throw new ChartSourceError(
          `${id.chart} is not a Chart this archive holds, so there is no ` +
            'address to fetch it from at the Chart Compiler.',
          { permanent: true },
        )
      }

      const url = chartWeekUrl(address, id.date)
      const payload = await requestJson(fetch, url, id)
      const named = weekDateNamed(payload)

      // ADR 0017 says this endpoint does not snap dates. Measured against it,
      // that is half right and the half it gets wrong is the dangerous one: a
      // date the Compiler does not publish is answered `{"redirect": {"url":
      // "/charts/singles-chart/20260724/7501/"}}` — the snap is there, it is
      // just in the body rather than in the Entries. Today that carries no
      // chart list, so the week below has no Entries and is refused as a week,
      // which is what the ADR observed.
      //
      // This refuses the other shape of it, and exists because the same ADR's
      // whole argument is that an undocumented endpoint changes without
      // notice: a page that came back answering for a different Chart Week is
      // not an answer, and archiving it would file real Entries under a date
      // nobody requested.
      if (named !== undefined && named !== id.date) {
        throw new ChartSourceError(
          `the Chart Compiler answered ${url} with the Chart Week of ${named}`,
        )
      }

      return { entries: chartItemsOf(payload).map(toSourceEntry), payload }
    },
  }
}

/**
 * `/ce-api/charts/<slug>/<YYYYMMDD>/<chartId>/`, built from the Chart's own row.
 *
 * Both segments come from the Chart rather than from anything written down
 * here, so a second Chart is a migration seeding two columns and not an edit to
 * this file.
 *
 * The trailing slash is the form the Compiler's own front end requests and the
 * form every measurement in ADR 0017 was taken through. Dropping it answers the
 * same page today; keeping it means this adapter is asking the question that
 * was actually verified 260 times.
 */
const chartWeekUrl = (address: ChartAddress, date: string): string =>
  `${CE_API}/charts/${address.slug}/${date.replaceAll('-', '')}/${address.chartId}/`

/** The response body, or a failure that says which half of the request it was. */
async function requestJson(
  fetch: FetchLike,
  url: string,
  id: ChartWeekId,
): Promise<unknown> {
  const at = `${id.chart} ${id.date}`

  let response: Response
  try {
    response = await fetchWithTimeout(fetch, url)
  } catch (cause) {
    const reason = cause instanceof Error ? cause.message : String(cause)
    throw new ChartSourceError(
      `the Chart Compiler could not be reached for ${at}: ${reason}`,
    )
  }

  // A chart id the Compiler does not have answers 500 with an HTML error page
  // — measured, and not what ADR 0017 predicts — so this is checked before
  // anything tries to read the body as JSON.
  if (!response.ok) {
    throw new ChartSourceError(
      `the Chart Compiler answered ${response.status} for ${at}`,
    )
  }

  try {
    return await response.json()
  } catch {
    throw new ChartSourceError(
      `the Chart Compiler answered ${at} with something that is not JSON`,
    )
  }
}

async function fetchWithTimeout(
  fetch: FetchLike,
  url: string,
): Promise<Response> {
  return await fetch(url, {
    signal: AbortSignal.timeout(REQUEST_MS),
    headers: {
      accept: 'application/json',
      // Said rather than disguised. The endpoint is undocumented and the
      // licensing question is open (ADR 0017); a request that names itself is
      // the only part of that this file can be right about.
      'user-agent': 'Waveger (+https://github.com/jacobrees-waveger/Waveger)',
    },
  })
}

/**
 * The Chart Week's rows, or none.
 *
 * None is an answer and not an error: a date the Compiler does not publish
 * comes back as a redirect with no chart list in it, and a week with no Entries
 * is refused by `validateChartWeek` as a week — recorded, with the whole
 * payload kept, and with nothing written to the archive.
 */
function chartItemsOf(payload: unknown): unknown[] {
  const list = firstNodeWhere(
    payload,
    (node) => node.element === CHART_LIST && Array.isArray(node.chartItems),
  )

  return list === undefined ? [] : (list.chartItems as unknown[])
}

/**
 * The Chart Week the response says it is of, when it says.
 *
 * Read off the page's own node rather than off a row, because a redirect names
 * no date at all and that is the case this has to be able to tell apart.
 */
function weekDateNamed(payload: unknown): string | undefined {
  const node = firstNodeWhere(
    payload,
    (candidate) => candidate.element === 'drupal-node-chart',
  )
  const date = node?.date

  return typeof date === 'string' ? date : undefined
}

/** The first node anywhere in the response that answers to the description. */
function firstNodeWhere(
  payload: unknown,
  matches: (node: Record<string, unknown>) => boolean,
): Record<string, unknown> | undefined {
  if (Array.isArray(payload)) {
    for (const item of payload) {
      const found = firstNodeWhere(item, matches)
      if (found !== undefined) return found
    }
    return undefined
  }

  if (typeof payload !== 'object' || payload === null) return undefined

  const node = payload as Record<string, unknown>
  if (matches(node)) return node

  for (const value of Object.values(node)) {
    const found = firstNodeWhere(value, matches)
    if (found !== undefined) return found
  }

  return undefined
}
