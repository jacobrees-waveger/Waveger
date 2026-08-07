import { expect, test } from 'vitest'
import { chartWeekDueOn } from './schedule'

/**
 * The one part of ingestion that cannot be driven through `app.request()`.
 *
 * Every other test in this package sends a request and reads a response,
 * because that is what a caller can see. This is a calendar rule, and the only
 * way to ask it about a Saturday is to hand it one — a route would have to be
 * given a clock to inject, which is machinery invented for a test rather than
 * for the product.
 */

test.each([
  { day: 'Friday, the day it publishes', now: '2026-07-31', due: '2026-07-31' },
  { day: 'the Saturday the schedule fires', now: '2026-08-01', due: '2026-07-31' },
  { day: 'the Sunday after', now: '2026-08-02', due: '2026-07-31' },
  { day: 'the Thursday before the next one', now: '2026-08-06', due: '2026-07-31' },
  { day: 'the following Friday', now: '2026-08-07', due: '2026-08-07' },
])('on $day the Chart Week due is $due', ({ now, due }) => {
  expect(chartWeekDueOn(new Date(`${now}T09:00:00Z`))).toBe(due)
})

/**
 * The Chart Week is a calendar date, not an instant. A run just after midnight
 * UTC and one just before it are the same Saturday and owe the same Friday.
 */
test('the hour of the day does not change which Chart Week is due', () => {
  const saturday = ['00:00:00', '06:30:00', '23:59:59'].map((time) =>
    chartWeekDueOn(new Date(`2026-08-01T${time}Z`)),
  )

  expect(saturday).toEqual(['2026-07-31', '2026-07-31', '2026-07-31'])
})
