import type { ChartWeekId } from '@waveger/domain'
import { ApifyClient, type ActorRun } from 'apify-client'
import { recordKey, toSourceEntry } from './actor-record'
import {
  ChartSourceError,
  type ChartSource,
  type ResumeCursor,
  type SourceChartWeek,
} from './source'

/**
 * Where chart data actually comes from: an Apify actor scraping the Official
 * Charts website.
 *
 * Everything Waveger knows about that actor is in this file, and that is the
 * whole point of the `ChartSource` seam (ADR 0002). Nothing above it knows an
 * actor exists — not the route, not ingestion, not the retry that resumes a
 * failed fetch through a cursor it cannot read.
 *
 * The actor is public, pay-per-event and unproven: five users, no reviews, and
 * 27 succeeded to 6 failed over the last thirty days. It charges $0.10 to start
 * and $0.001 a record, so one Chart Week is $0.20 and the account's Free-plan
 * ceiling is $5 a month. Three things in here follow from that ceiling rather
 * than from tidiness: `maxItems`, which converts directly to money; the resume
 * cursor, which stops a retry paying twice for records already received; and
 * the abort of a run this has stopped waiting for, which would otherwise keep
 * spending while the next attempt spends alongside it.
 */

/**
 * `username/actor-name`, not the opaque id.
 *
 * Written down rather than configured, because it is not a secret and not an
 * environment: it is which scraper Waveger buys its chart data from, which is a
 * decision this repository made (ADR 0002) and would make again in a commit if
 * it changed. An environment variable would put it somewhere no reader looks.
 */
const ACTOR = 'jungle_synthesizer/officialcharts-uk-singles-albums-chart-scraper'

/**
 * A Waveger Chart, in the actor's own terms.
 *
 * `records` is a hard spend cap and not the Chart's size — the Chart's own
 * `position_count` lives on its row and is what a week is *validated* against.
 * They agree today and they are not the same fact: this one is the most this
 * source will ever pay for in one fetch, and at $0.001 a record it is money
 * with the decimal point moved.
 *
 * The actor's default is `["singles-chart", "albums-chart"]`. Waveger needs
 * only the singles chart, and leaving the default would double the bill for
 * data it discards.
 */
const ACTOR_CHARTS: Readonly<Record<string, { slug: string; records: number }>> =
  {
    'uk-singles': { slug: 'singles-chart', records: 100 },
  }

/**
 * How long one run gets, in seconds.
 *
 * Both the wait and the run's own timeout, so that giving up and the actor
 * giving up are the same moment. The verified run took thirteen seconds. The
 * number that matters is the budget above it: three attempts and two backoffs
 * have to finish inside the 300 seconds Vercel gives a function.
 */
const RUN_SECONDS = 75

/**
 * The actor's own prices, and what one fetch may cost at most.
 *
 * Verified against the account's run history rather than read off a listing:
 * the ADR 0002 run was billed exactly $0.20 for one start and 100 records.
 * A tenth on top absorbs the rounding at the boundary — the ceiling exists to
 * stop a runaway, not to cut off the run it was sized for.
 */
const ACTOR_START_USD = 0.1
const RECORD_USD = 0.001
const chargeCeilingUsd = (records: number): number =>
  // Rounded, because the arithmetic is in floating point and 0.22 comes out as
  // 0.22000000000000003 — a number to put in a request, not to leave one in.
  Number(((ACTOR_START_USD + records * RECORD_USD) * 1.1).toFixed(2))

/** What this source puts in a `ResumeCursor`, and the only thing that reads it. */
interface ApifyResume {
  /**
   * The failed run's `resumeCursor`, from its own OUTPUT record. Handing it
   * back makes the next run continue that crawl rather than start one, so the
   * records already scraped are not scraped — or charged for — twice.
   */
  cursor: string
  /**
   * Every dataset in the chain, oldest first. A resumed run only writes what it
   * had left to do, so the Chart Week is all of them together.
   */
  datasets: string[]
}

export interface ApifyChartSourceOptions {
  /**
   * `APIFY_TOKEN`. Undefined is a state rather than an omission: a deployment
   * without it fails every fetch, loudly and in the run log, instead of failing
   * when the module loads and taking the public API down with it.
   */
  token: string | undefined
}

export function createApifyChartSource(
  options: ApifyChartSourceOptions,
): ChartSource {
  const { token } = options

  return {
    async fetchChartWeek(
      id: ChartWeekId,
      resumeFrom?: ResumeCursor,
    ): Promise<SourceChartWeek> {
      // Both of these are permanent: a token that is missing now is missing on
      // the third attempt too, and no amount of waiting teaches the actor a
      // Chart it does not scrape.
      if (token === undefined || token === '') {
        throw new ChartSourceError(
          'This deployment holds no Apify token, so it cannot fetch a Chart ' +
            'Week. Set APIFY_TOKEN on the Vercel project.',
          { permanent: true },
        )
      }

      const chart = ACTOR_CHARTS[id.chart]
      if (chart === undefined) {
        throw new ChartSourceError(
          `${id.chart} is not a Chart this source can fetch. The actor scrapes ` +
            `${Object.keys(ACTOR_CHARTS).join(', ')}.`,
          { permanent: true },
        )
      }

      const client = new ApifyClient({ token })
      const resume = resumeOf(resumeFrom)

      const run = await client.actor(ACTOR).call(
        {
          charts: [chart.slug],
          // One date twice, because the actor walks a range and Waveger fetches
          // one Chart Week. Left empty it would scrape "the current week only",
          // which is a different week on a Friday than on a Thursday.
          startDate: id.date,
          endDate: id.date,
          maxItems: chart.records,
          ...(resume === undefined ? {} : { resumeCursor: resume.cursor }),
        },
        {
          waitSecs: RUN_SECONDS,
          timeout: RUN_SECONDS,
          // The cap the *platform* enforces, as opposed to `maxItems`, which is
          // the actor's own input and only as good as the actor. This one is
          // what makes "a fetch costs $0.20" a fact rather than an expectation
          // — the account's whole month is $5 (ADR 0002).
          maxTotalChargeUsd: chargeCeilingUsd(chart.records),
          // The client streams the actor's own log into ours by default, which
          // is sixty lines a week saying a scrape went fine. The run is in
          // Apify's console with its whole log if a week needs explaining, and
          // why it failed is recorded on the `ingestion_run` row either way.
          log: null,
        },
      )

      const datasets = [...(resume?.datasets ?? []), run.defaultDatasetId]

      if (run.status !== 'SUCCEEDED') {
        throw await failed(client, run, id, { ...resume, datasets })
      }

      const records = await stitch(client, datasets, chart.records)

      return { entries: records.map(toSourceEntry), payload: records }
    },
  }
}

/**
 * A run that did not succeed, turned into an error that can be resumed from.
 *
 * A run still going is aborted first. Waiting for it is what has just been
 * given up on, and an actor left running would keep charging for records while
 * the next attempt charges for its own — the one shape of failure that costs
 * more the harder it is retried.
 *
 * The cursor is read from the run's OUTPUT record, which is where the actor
 * writes it. A run that died before writing one falls back to the cursor its
 * predecessor left, because a resumed run continues that same crawl: the queue
 * has had more of its work marked done, so handing the old cursor on again
 * still skips it. Only a first attempt that leaves no cursor is unresumable,
 * and then the next attempt starts the crawl over, which is all it can do.
 */
async function failed(
  client: ApifyClient,
  run: ActorRun,
  id: ChartWeekId,
  chain: { cursor?: string; datasets: string[] },
): Promise<ChartSourceError> {
  const unfinished = run.status === 'READY' || run.status === 'RUNNING'
  const reason = `the actor run for ${id.chart} ${id.date} ${
    unfinished ? `did not finish inside ${RUN_SECONDS}s` : run.status.toLowerCase()
  }`

  if (unfinished) {
    await client
      .run(run.id)
      .abort()
      .catch(() => undefined)
  }

  const cursor = (await resumeCursorOf(client, run.id)) ?? chain.cursor
  return cursor === undefined
    ? new ChartSourceError(reason)
    : new ChartSourceError(reason, {
        resumeFrom: { cursor, datasets: chain.datasets },
      })
}

/** The `resumeCursor` the actor leaves in its OUTPUT, when it left one. */
async function resumeCursorOf(
  client: ApifyClient,
  runId: string,
): Promise<string | undefined> {
  const output = await client
    .run(runId)
    .keyValueStore()
    .getRecord('OUTPUT')
    .catch(() => undefined)

  const value: unknown = output?.value
  const cursor =
    typeof value === 'object' && value !== null
      ? (value as Record<string, unknown>).resumeCursor
      : undefined

  return typeof cursor === 'string' && cursor !== '' ? cursor : undefined
}

/**
 * Every dataset in the chain, in the order they were written.
 *
 * A record already seen in an earlier dataset is dropped, because a resumed
 * crawl can re-emit whatever the run before it was in the middle of. That is
 * the *only* thing dropped, and only across the join between two runs: a
 * duplicate Position inside one run is exactly the half-scraped week that
 * validation exists to refuse, and repairing it here would hide it.
 */
async function stitch(
  client: ApifyClient,
  datasets: readonly string[],
  limit: number,
): Promise<unknown[]> {
  const records: unknown[] = []
  const seen = new Set<string>()

  for (const dataset of datasets) {
    const { items } = await client.dataset(dataset).listItems({ limit })

    // Judged against the runs *before* this one, and `seen` is only widened
    // afterwards, so a Position this run emitted twice by itself survives to be
    // refused rather than being quietly halved here.
    records.push(...items.filter((item) => !seen.has(recordKey(item))))
    for (const item of items) seen.add(recordKey(item))
  }

  return records
}

/** A cursor this source issued, read back. Anything else is not resumable. */
function resumeOf(resumeFrom: ResumeCursor | undefined): ApifyResume | undefined {
  const cursor = resumeFrom?.cursor
  const datasets = resumeFrom?.datasets

  return typeof cursor === 'string' &&
    Array.isArray(datasets) &&
    datasets.every((dataset) => typeof dataset === 'string')
    ? { cursor, datasets }
    : undefined
}
