import { expect, test } from 'vitest'
import { chartWeeksFrom, previousChartWeekDate } from './cadence'

/**
 * The cadence, on its own. `archive.test.ts` drives gap detection through the
 * route; this covers the arithmetic underneath it, including the case a route
 * test structurally cannot reach — every fixture there is built by counting
 * back from the Chart Week due now, so every date in it is already on the
 * cadence, and a walk that quietly drifted off would still line up.
 */

test('the previous Chart Week is seven days back, across a month end', () => {
  expect(previousChartWeekDate('2026-07-31')).toBe('2026-07-24')
  expect(previousChartWeekDate('2026-08-07')).toBe('2026-07-31')
  expect(previousChartWeekDate('2026-01-01')).toBe('2025-12-25')
})

/**
 * The clocks go forward in the UK on 2026-03-29, between these two Fridays.
 * A date is a calendar date and never an instant, so it does not notice.
 */
test('the cadence does not notice a daylight-saving boundary', () => {
  expect(previousChartWeekDate('2026-04-03')).toBe('2026-03-27')
  expect(chartWeeksFrom('2026-03-20', '2026-04-03')).toEqual([
    '2026-03-20',
    '2026-03-27',
    '2026-04-03',
  ])
})

test('the walk includes both ends', () => {
  expect(chartWeeksFrom('2026-07-31', '2026-07-31')).toEqual(['2026-07-31'])
  expect(chartWeeksFrom('2026-07-17', '2026-07-31')).toEqual([
    '2026-07-17',
    '2026-07-24',
    '2026-07-31',
  ])
})

test('a Span whose end precedes its start contains no Chart Weeks', () => {
  expect(chartWeeksFrom('2026-07-31', '2026-07-24')).toEqual([])
})

/**
 * The walk is anchored on `to`, which is the end that is known to be on the
 * cadence: it is the Chart Week due now, always a Friday, while the other end
 * is read out of the archive and nothing in the schema requires a `week_date`
 * to be anything in particular.
 *
 * So one mistyped date costs the week it names and no more. Anchored on `from`
 * instead, a single Thursday in the archive would shift the whole walk onto
 * Thursdays: every real Chart Week would report as Missing, and the partial
 * week left at the end would drop `to` itself — the one week whose absence says
 * the schedule has stopped.
 */
test('a start date off the cadence does not drag the walk off it', () => {
  // A Thursday, two days adrift of the Friday two weeks before the end.
  const walk = chartWeeksFrom('2026-07-15', '2026-07-31')

  expect(walk).toEqual(['2026-07-17', '2026-07-24', '2026-07-31'])
  expect(walk.at(-1)).toBe('2026-07-31')
})
