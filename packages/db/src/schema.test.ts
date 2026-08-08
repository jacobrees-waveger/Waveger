import { sql } from 'kysely'
import { afterEach, beforeEach, expect, test } from 'vitest'
import { createTestDatabase, type TestDatabase } from './testing'

/**
 * What the migrations actually built, asked of a real Postgres.
 *
 * `schema.ts` is hand-written to match the SQL because ADR 0004 chose a query
 * builder over an ORM, and nothing makes the two agree: a column declared
 * there and never created typechecks everywhere and is a `42703` the first
 * time it runs. Everything below reads and writes through Kysely, so the types
 * and the schema are right together or wrong together.
 *
 * The constraints get the same treatment, because a key or a `not null` that
 * silently went missing is invisible to every test that only writes valid
 * rows — so each one is proved by a write it has to refuse.
 */

let database: TestDatabase

beforeEach(async () => {
  database = await createTestDatabase()
})

afterEach(async () => {
  await database.dispose()
})

test("a Chart carries the Chart Compiler's own slug and chart id", async () => {
  const chart = await database.db
    .selectFrom('chart')
    .select(['compiler_slug', 'compiler_chart_id'])
    .where('slug', '=', 'uk-singles')
    .executeTakeFirstOrThrow()

  expect(chart).toEqual({
    compiler_slug: 'singles-chart',
    compiler_chart_id: 7501,
  })
})

/**
 * A Chart nothing can address is a Chart nothing can fetch a week of, so the
 * schema refuses one rather than leaving it to be discovered at the first
 * ingestion.
 */
test('a Chart cannot exist without an address at the Chart Compiler', async () => {
  // Raw SQL because Kysely will not build this insert: the columns are not
  // nullable in `schema.ts`, which is the claim Postgres is being asked about.
  const withoutAnAddress = sql`
    insert into chart (slug, name, position_count) values ('uk-albums', 'X', 100)
  `.execute(database.db)

  await expect(withoutAnAddress).rejects.toThrow(/compiler_slug/)
})

/** Two Waveger Charts reading one Chart would archive the same weeks twice. */
test('two Charts cannot share one address at the Chart Compiler', async () => {
  const sameAddress = database.db
    .insertInto('chart')
    .values({
      slug: 'uk-singles-again',
      name: 'The same Chart under another name',
      position_count: 100,
      compiler_slug: 'singles-chart',
      compiler_chart_id: 7501,
    })
    .execute()

  await expect(sameAddress).rejects.toThrow(/chart_compiler_address_key/)
})

/**
 * Two credits the Compiler resolves to one id are one Artist, and the key is
 * what makes that so. `CONTEXT.md` puts that rule with the Compiler and never
 * with Waveger, so nothing here may reach a different answer by reading the
 * credit strings.
 */
test('an Artist is keyed on the id the Chart Compiler gave them', async () => {
  await database.db
    .insertInto('artist')
    .values({ id: '54705', name: 'Sam Fender' })
    .execute()

  await database.db
    .insertInto('artist')
    .values({ id: '54705', name: 'Sam Fender & Olivia Dean' })
    .onConflict((oc) => oc.column('id').doNothing())
    .execute()

  const artists = await database.db
    .selectFrom('artist')
    .select(['id', 'name'])
    .execute()

  expect(artists).toEqual([{ id: '54705', name: 'Sam Fender' }])
})

/**
 * An Entry may name an Artist and need not.
 *
 * A Chart Week is Held on whether every Position is there and never on whether
 * its source reported Artist identity — the retained Apify adapter reports
 * none (ADR 0017), so an Entry without one has to persist exactly as it did
 * before this column existed.
 */
test('an Entry may name an Artist, and stands without one', async () => {
  const week = await database.db
    .insertInto('chart_week')
    .values({ chart_slug: 'uk-singles', week_date: '2026-07-31' })
    .returning('id')
    .executeTakeFirstOrThrow()

  await database.db
    .insertInto('artist')
    .values({ id: '54705', name: 'Sam Fender' })
    .execute()

  const resolved = await songAtPosition(week.id, 1, 'SAM FENDER', 'PEOPLE WATCHING')
  const unresolved = await songAtPosition(week.id, 2, 'NOBODY', 'NOBODY SAID')

  await database.db
    .insertInto('entry')
    .values([
      { ...resolved, artist_id: '54705' },
      // No `artist_id` at all, which is what the code serving today writes.
      unresolved,
    ])
    .execute()

  const entries = await database.db
    .selectFrom('entry')
    .select(['position', 'artist_id'])
    .orderBy('position')
    .execute()

  expect(entries).toEqual([
    { position: 1, artist_id: '54705' },
    { position: 2, artist_id: null },
  ])
})

/**
 * Naming no Artist and naming one who is not here are different things. The
 * first is a source that reported no identity; the second is a bug, and the
 * archive is where it stops.
 */
test('an Entry cannot name an Artist the archive does not hold', async () => {
  const week = await database.db
    .insertInto('chart_week')
    .values({ chart_slug: 'uk-singles', week_date: '2026-07-31' })
    .returning('id')
    .executeTakeFirstOrThrow()

  const entry = await songAtPosition(week.id, 1, 'SAM FENDER', 'PEOPLE WATCHING')

  const unknownArtist = database.db
    .insertInto('entry')
    .values({ ...entry, artist_id: '54705' })
    .execute()

  await expect(unknownArtist).rejects.toThrow(/entry_artist_id_fkey/)
})

/** Inserts a Song, and returns the Entry values putting it at a Position. */
async function songAtPosition(
  chartWeekId: string,
  position: number,
  artist: string,
  title: string,
) {
  const song = await database.db
    .insertInto('song')
    .values({
      fingerprint: `${artist.toLowerCase()}|${title.toLowerCase()}`,
      title,
      artist,
    })
    .returning('id')
    .executeTakeFirstOrThrow()

  return {
    chart_week_id: chartWeekId,
    position,
    song_id: song.id,
    peak_position: position,
    weeks_on_chart: 1,
  }
}
