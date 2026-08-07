import { createTestDatabase, type TestDatabase } from '@waveger/db/testing'
import { chartWeekSchema } from '@waveger/domain'
import { afterEach, beforeEach, expect, test } from 'vitest'
import { createApi } from '../app'
import previousWeek from '../chart/fixtures/uk-singles-2026-07-24.json'
import verifiedRun from '../chart/fixtures/uk-singles-2026-07-31.json'
import { createFixtureChartSource } from '../chart/fixture-source'

/** What a visitor sees, read from Waveger's own archive. */

let database: TestDatabase

const records = verifiedRun as readonly Record<string, unknown>[]

/** The verified week and the hand-authored week before it. */
const twoWeeks = createFixtureChartSource({
  'uk-singles/2026-07-31': records,
  'uk-singles/2026-07-24': previousWeek,
})

/**
 * The operator secret this file's API is built with, sent on every
 * `/api/internal/*` call below. Real, not bypassed: the guard these tests run
 * through is the one a deployment runs (ADR 0011).
 */
const OPERATOR_SECRET = 'test-operator-secret'

const apiFor = (source = twoWeeks) =>
  createApi({
    db: database.db,
    chartSource: source,
    operatorSecret: OPERATOR_SECRET,
  })

const ingest = (api: ReturnType<typeof createApi>, date: string) =>
  api.request('/api/internal/ingest', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${OPERATOR_SECRET}`,
    },
    body: JSON.stringify({ chart: 'uk-singles', date }),
  })

beforeEach(async () => {
  database = await createTestDatabase()
})

afterEach(async () => {
  await database.dispose()
})

test('an archive holding no Chart Week says so', async () => {
  const response = await apiFor().request('/api/v1/chart-weeks/latest')

  expect(response.status).toBe(404)
  expect(await response.json()).toMatchObject({ error: 'no_chart_week' })
})

test('the latest Chart Week is the most recently published, not the most recently fetched', async () => {
  const api = apiFor()

  await ingest(api, '2026-07-31')
  await ingest(api, '2026-07-24')

  const response = await api.request('/api/v1/chart-weeks/latest')
  const week = chartWeekSchema.parse(await response.json())

  expect(week.date).toBe('2026-07-31')
})

test('a Chart Week is served in Position order, 1 first', async () => {
  const api = apiFor()
  await ingest(api, '2026-07-31')

  const response = await api.request('/api/v1/chart-weeks/latest')
  const week = chartWeekSchema.parse(await response.json())

  expect(week.entries.map((entry) => entry.position)).toEqual(
    Array.from({ length: 100 }, (_, index) => index + 1),
  )
})

/**
 * Song identity, through the only behaviour that makes it visible.
 *
 * A Song keeps the credit it was first reported under, so when a later Chart
 * Week spells one differently, the spelling that comes back says whether
 * Waveger treated the two as one Song or as two. The rule matters more than
 * its test suggests: merging two distinct Songs cannot be undone once Entries
 * point at the merged one, while splitting one is visible and fixable.
 */
type Spelling = { artist: string; title: string }

const naming = (spelling: Spelling) =>
  records.map((record, index) =>
    index === 0 ? { ...record, ...spelling } : record,
  )

test.each([
  {
    respelt: 'case and whitespace',
    first: { artist: 'THE WANDERING HEARTS', title: 'LONG WAY DOWN' },
    then: { artist: 'The Wandering  Hearts ', title: ' Long Way Down' },
    oneSong: true,
  },
  {
    respelt: 'an elided apostrophe',
    first: { artist: 'THE WANDERING HEARTS', title: "DON'T LOOK DOWN" },
    then: { artist: 'THE WANDERING HEARTS', title: 'DONT LOOK DOWN' },
    oneSong: true,
  },
  {
    respelt: 'punctuation between words',
    first: { artist: 'THE WANDERING HEARTS', title: 'ROCK-N-ROLL' },
    then: { artist: 'THE WANDERING/HEARTS', title: 'ROCK N ROLL' },
    oneSong: true,
  },
  {
    // The other half of that rule: punctuation leaves a space behind, so two
    // words are not the one word they would be if it left nothing.
    respelt: 'words run together',
    first: { artist: 'THE WANDERING HEARTS', title: 'LONG WAY DOWN' },
    then: { artist: 'THEWANDERINGHEARTS', title: 'LONGWAYDOWN' },
    oneSong: false,
  },
  {
    respelt: 'a featured credit',
    first: { artist: 'THE WANDERING HEARTS', title: 'LONG WAY DOWN' },
    then: {
      artist: 'THE WANDERING HEARTS & SAM FENDER',
      title: 'LONG WAY DOWN',
    },
    oneSong: false,
  },
  {
    respelt: 'an accent',
    first: { artist: 'THE WANDERING HEARTS', title: 'LONG WAY DOWN' },
    then: { artist: 'THE WANDERING HEÁRTS', title: 'LONG WAY DOWN' },
    oneSong: false,
  },
  {
    respelt: 'a remix suffix',
    first: { artist: 'THE WANDERING HEARTS', title: 'LONG WAY DOWN' },
    then: { artist: 'THE WANDERING HEARTS', title: 'LONG WAY DOWN - RADIO EDIT' },
    oneSong: false,
  },
])(
  'a Song respelt by $respelt the next Chart Week is one Song: $oneSong',
  async ({ first, then: respelling, oneSong }: {
    respelt: string
    first: Spelling
    then: Spelling
    oneSong: boolean
  }) => {
    const api = apiFor(
      createFixtureChartSource({
        'uk-singles/2026-07-24': naming(first),
        'uk-singles/2026-07-31': naming(respelling),
      }),
    )

    await ingest(api, '2026-07-24')
    await ingest(api, '2026-07-31')

    const week = chartWeekSchema.parse(
      await (await api.request('/api/v1/chart-weeks/latest')).json(),
    )

    expect(week.entries[0]).toMatchObject(oneSong ? first : respelling)
  },
)

test('a Chart Week ingested twice over is still one week of Entries', async () => {
  const api = apiFor()

  await ingest(api, '2026-07-24')
  await ingest(api, '2026-07-31')
  await ingest(api, '2026-07-24')

  const week = chartWeekSchema.parse(
    await (await api.request('/api/v1/chart-weeks/latest')).json(),
  )

  expect(week.date).toBe('2026-07-31')
  expect(week.entries).toHaveLength(100)
})
