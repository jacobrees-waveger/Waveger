import { createTestDatabase, type TestDatabase } from '@waveger/db/testing'
import {
  chartWeekSchema,
  type ChartMovement,
  type ChartWeek,
} from '@waveger/domain'
import { afterEach, beforeEach, expect, test } from 'vitest'
import { createApi } from '../app'
import previousWeek from '../chart/fixtures/uk-singles-2026-07-24.json'
import verifiedRun from '../chart/fixtures/uk-singles-2026-07-31.json'
import { createFixtureChartSource } from '../chart/fixture-source'

/**
 * Movement, debuts and exits — the shape of the week rather than a flat list.
 *
 * Driven through `app.request()` against a real Postgres, because movement is
 * a fact about two Chart Weeks sitting next to each other in the archive and
 * there is nothing to assert until they are both in it.
 *
 * The two fixtures are adjacent on purpose. 2026-07-31 is the verified run ADR
 * 0002 checked by hand; 2026-07-24 is hand-authored to sit exactly one week
 * behind it, and the numbers below are what that pairing produces:
 *
 *     37 climbs · 41 falls · 11 non-movers · 11 debuts · 11 exits
 *
 * Wherever the actor could tell us where a Song stood, the earlier week says
 * the same thing: the 37 climbers and 11 non-movers keep the `last_week` the
 * verified run reported for them, and the 11 debuts are the Songs it marks
 * `is_new`. So the derivation below agrees with two fields it never reads. The
 * 41 descenders are the ones it could not tell us about — `last_week` is null
 * for every one of them (ADR 0002) — and their earlier Positions are invented,
 * which is exactly the gap this whole ticket exists to fill.
 */

let database: TestDatabase

const records = verifiedRun as readonly Record<string, unknown>[]

const twoWeeks = createFixtureChartSource({
  'uk-singles/2026-07-31': records,
  'uk-singles/2026-07-24': previousWeek,
})

const apiFor = (source = twoWeeks) =>
  createApi({ db: database.db, chartSource: source })

const ingest = (api: ReturnType<typeof createApi>, date: string) =>
  api.request('/api/internal/ingest', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ chart: 'uk-singles', date }),
  })

const latest = async (
  api: ReturnType<typeof createApi>,
): Promise<ChartWeek> =>
  chartWeekSchema.parse(
    await (await api.request('/api/v1/chart-weeks/latest')).json(),
  )

/** The verified week, read with its predecessor already held. */
async function weekWithPredecessor(): Promise<ChartWeek> {
  const api = apiFor()
  await ingest(api, '2026-07-24')
  await ingest(api, '2026-07-31')
  return latest(api)
}

const movementAt = (week: ChartWeek, position: number): ChartMovement => {
  const entry = week.entries.find(
    (candidate) => candidate.position === position,
  )
  if (entry === undefined) throw new Error(`No Entry at Position ${position}`)
  return entry.movement
}

const positionsWhere = (week: ChartWeek, kind: ChartMovement['kind']) =>
  week.entries
    .filter((entry) => entry.movement.kind === kind)
    .map((entry) => entry.position)

beforeEach(async () => {
  database = await createTestDatabase()
})

afterEach(async () => {
  await database.dispose()
})

test('a Chart Week whose predecessor is held reports climbs, falls and non-movers', async () => {
  const week = await weekWithPredecessor()

  const gained = week.entries.flatMap((entry) =>
    entry.movement.kind === 'moved' ? [entry.movement.positionsGained] : [],
  )

  expect({
    climbed: gained.filter((positions) => positions > 0).length,
    fell: gained.filter((positions) => positions < 0).length,
    nonMover: positionsWhere(week, 'non-mover').length,
    debut: positionsWhere(week, 'debut').length,
    unknown: positionsWhere(week, 'unknown').length,
  }).toEqual({ climbed: 37, fell: 41, nonMover: 11, debut: 11, unknown: 0 })
})

/**
 * Position 1 is the top, so `positionsGained` is what it says: a climb is a
 * fall in the number. The cases below are one of each kind the archive can
 * derive, at Positions chosen because their answers are checkable by hand
 * against the two fixtures.
 */
test.each([
  {
    position: 1,
    of: 'the Song that stayed at number one',
    movement: { kind: 'non-mover' },
  },
  {
    position: 3,
    of: 'a Song up from Position 5',
    movement: { kind: 'moved', positionsGained: 2 },
  },
  {
    position: 5,
    of: 'a Song down from Position 3',
    movement: { kind: 'moved', positionsGained: -2 },
  },
  {
    position: 45,
    of: "the week's biggest climb, from Position 67",
    movement: { kind: 'moved', positionsGained: 22 },
  },
  {
    position: 75,
    of: "the week's biggest fall, from Position 56",
    movement: { kind: 'moved', positionsGained: -19 },
  },
  {
    position: 16,
    of: 'a Song that was not on the Chart last week',
    movement: { kind: 'debut' },
  },
])('movement at Position $position is $of', async ({ position, movement }) => {
  expect(movementAt(await weekWithPredecessor(), position)).toEqual(movement)
})

test('the debuts are exactly the Songs with no Entry in the previous Chart Week', async () => {
  const week = await weekWithPredecessor()

  expect(positionsWhere(week, 'debut')).toEqual([
    16, 22, 53, 59, 61, 77, 81, 84, 85, 99, 100,
  ])
})

/**
 * The archive boundary, and the reason `unknown` is a state of its own.
 *
 * Waveger's earliest Chart Week has no predecessor. Every Song on it was on
 * some chart the week before — Waveger simply cannot say which Position — so
 * rendering it as a hundred brand-new arrivals would be a hundred false claims.
 */
test('the earliest held Chart Week reports unknown movement, never a debut', async () => {
  const api = apiFor()
  await ingest(api, '2026-07-24')

  const week = await latest(api)

  expect(positionsWhere(week, 'unknown')).toHaveLength(100)
  expect(positionsWhere(week, 'debut')).toEqual([])
  expect(week.exits).toEqual([])
})

/**
 * The previous Chart Week is the edition before this one, not merely the
 * nearest one Waveger happens to hold. A Chart publishes on a fixed weekly
 * cadence, so a week two editions back is not a predecessor and movement
 * measured against it would be silently wrong rather than absent.
 */
test('a Chart Week whose immediate predecessor is missing reports unknown, not movement across the gap', async () => {
  const api = apiFor(
    createFixtureChartSource({
      'uk-singles/2026-07-31': records,
      'uk-singles/2026-07-17': previousWeek,
    }),
  )

  await ingest(api, '2026-07-17')
  await ingest(api, '2026-07-31')

  const week = await latest(api)

  expect(week.date).toBe('2026-07-31')
  expect(positionsWhere(week, 'unknown')).toHaveLength(100)
  expect(week.exits).toEqual([])
})

/**
 * Nothing is denormalised, so backfilling a past Chart Week fixes its
 * neighbour on the next read. There is no reprocessing step to forget to run.
 */
test('backfilling the previous Chart Week turns unknown movement into real movement', async () => {
  const api = apiFor()
  await ingest(api, '2026-07-31')

  expect(movementAt(await latest(api), 3)).toEqual({ kind: 'unknown' })

  await ingest(api, '2026-07-24')

  expect(movementAt(await latest(api), 3)).toEqual({
    kind: 'moved',
    positionsGained: 2,
  })
})

test('the Songs that left the Chart are returned, ordered by the Position they held', async () => {
  const week = await weekWithPredecessor()

  // Read as the tail of the Chart they have just left: Position, then Song.
  expect(
    week.exits.map((exit) => [exit.previousPosition, exit.title, exit.artist]),
  ).toEqual([
    [86, 'SALT AND SMOKE', 'THE HARBOUR LIGHTS'],
    [87, 'PAPER MOONS', 'ELIZA VANCE'],
    [88, 'NIGHT BUS HOME', 'KOJO ADESINA'],
    [89, 'CALLING CARD', 'THE LOST SIGNAL'],
    [92, "SOMEONE ELSE'S SUMMER", 'MARA DELACROIX'],
    [94, 'LOW TIDE', 'BRIONY QUAYLE'],
    [95, 'CHALK OUTLINE', 'THE FEN'],
    [96, 'RUNNING THE RED', 'DESSA HOLLOWAY'],
    [97, 'TELEGRAM', 'PIETRO NALDI'],
    [98, 'WINTER PALACE', 'THE SEVENTH FLOOR'],
    [99, 'HALF A HEART AWAY', 'NOOR HADDAD'],
  ])
})

test('an exit has no Entry in the Chart Week it left', async () => {
  const week = await weekWithPredecessor()

  const charted = new Set(week.entries.map((entry) => entry.title))
  expect(week.exits.filter((exit) => charted.has(exit.title))).toEqual([])
  expect(week.entries).toHaveLength(100)
})

/**
 * The actor's `last_week` and `is_new` are not read, and this is what proves
 * it rather than a grep. Both are replaced with values that contradict the
 * archive: `last_week` says every Song was at Position 100, `is_new` says
 * every Song is a debut. Movement is unchanged, because it comes from the
 * previous Chart Week's own Entries.
 */
test('movement ignores what the source claims about the previous week', async () => {
  const api = apiFor(
    createFixtureChartSource({
      'uk-singles/2026-07-24': previousWeek,
      'uk-singles/2026-07-31': records.map((record) => ({
        ...record,
        last_week: 100,
        is_new: true,
        movement: 'new',
      })),
    }),
  )

  await ingest(api, '2026-07-24')
  await ingest(api, '2026-07-31')
  const week = await latest(api)

  expect(movementAt(week, 1)).toEqual({ kind: 'non-mover' })
  expect(movementAt(week, 3)).toEqual({
    kind: 'moved',
    positionsGained: 2,
  })
  expect(positionsWhere(week, 'debut')).toHaveLength(11)
})
