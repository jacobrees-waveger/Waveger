import { expect, test } from 'vitest'
import { createApifyChartSource } from './apify-source'
import { ChartSourceError, type FindChartAddress } from './source'

/**
 * The retained fallback, at the two points it can answer without spending
 * anything.
 *
 * ADR 0017 moves a deployment onto the Chart Compiler's own API and keeps this
 * adapter as the mitigation for an endpoint that is undocumented and can change
 * without notice. A mitigation nothing exercises is a mitigation that has
 * quietly stopped compiling, so what can be checked without an Apify token and
 * a $0.20 run is checked here: the refusals it reaches before it starts one.
 *
 * Everything past that point needs the actor itself. It is not stubbed, because
 * a stubbed `ApifyClient` would prove this file agrees with a fake of Apify
 * rather than with Apify.
 */

const ukSingles: FindChartAddress = (chart) =>
  Promise.resolve(
    chart === 'uk-singles' ? { slug: 'singles-chart', chartId: 7501 } : null,
  )

const WEEK = { chart: 'uk-singles', date: '2026-07-31' }

/**
 * Said once rather than three times over six seconds. A token that is missing
 * now is missing on the third attempt, and waiting to say so turns "APIFY_TOKEN
 * is not set" into "…(after 3 attempts)", which reads like a flaky actor.
 */
test('a deployment holding no token says so once, and never retries', async () => {
  const source = createApifyChartSource({
    token: undefined,
    chartAddress: ukSingles,
  })

  const fetched = source.fetchChartWeek(WEEK)

  await expect(fetched).rejects.toBeInstanceOf(ChartSourceError)
  await expect(fetched).rejects.toMatchObject({ permanent: true })
  await expect(fetched).rejects.toThrow(/APIFY_TOKEN/)
})

/**
 * The Chart's address comes from the Chart's own row, exactly as the Compiler's
 * adapter gets it — this file no longer keeps a copy of which Chart is which.
 * Two copies would have nothing keeping them in step, and their disagreement
 * would show as the wrong Chart being fetched rather than as an error.
 */
test('a Chart with no address at the Compiler is refused before any run starts', async () => {
  const source = createApifyChartSource({
    token: 'a token this test never gets to spend',
    chartAddress: () => Promise.resolve(null),
  })

  const fetched = source.fetchChartWeek(WEEK)

  await expect(fetched).rejects.toMatchObject({ permanent: true })
  await expect(fetched).rejects.toThrow(/no address to scrape it from/)
})

/**
 * What this source will pay for is its own fact and stays with it: `records` is
 * a spend cap at $0.001 a record against an account capped at $5 a month
 * (ADR 0002), not the Chart's address and not its size.
 */
test('a Chart the actor is not budgeted for is refused before any run starts', async () => {
  const source = createApifyChartSource({
    token: 'a token this test never gets to spend',
    chartAddress: () =>
      Promise.resolve({ slug: 'dance-singles-chart', chartId: 104 }),
  })

  const fetched = source.fetchChartWeek({
    chart: 'uk-dance',
    date: '2026-07-31',
  })

  await expect(fetched).rejects.toMatchObject({ permanent: true })
  await expect(fetched).rejects.toThrow(/no record budget/)
})

/** Every source says which one it is, so that every run can record it. */
test('the actor answers to its own name', () => {
  const source = createApifyChartSource({
    token: undefined,
    chartAddress: ukSingles,
  })

  expect(source.name).toBe('apify')
})
