import { z } from 'zod'
import type { IngestionFlag } from '@waveger/db'
import type { ArchivedChart } from './archive'
import { normalisedName } from './fingerprint'
import type { SourceEntry } from './source'

/**
 * A Chart Week is judged as a whole, before anything is written.
 *
 * The actor fails 19% of the time (ADR 0002), and the dangerous failure is not
 * the one that errors — it is the run that returns 87 of 100 Positions and
 * looks like a chart. A week is what the Chart says it is: exactly that many
 * Positions, contiguous from 1, each naming a Song and an Artist. Anything else
 * is a half-scraped run, and the whole of it is refused.
 *
 * That list is the whole of it, deliberately. Waveger consumes Charts and never
 * compiles them, so a figure that merely looks wrong — a peak Position of 150,
 * a Song in its 900th week — is evidence about the source and not a reason to
 * throw away a published week. The only thing asked of those figures is that
 * they be numbers at all, because an Entry that reports none is not an Entry.
 */

/** The Chart Compiler's own cap, checked and flagged but never enforced. */
const ENTRIES_PER_ARTIST_CAP = 3

/**
 * A flag on the wire, stated once for both routes that report one.
 *
 * Matched to `IngestionFlag`, which is the shape the `flags` column holds —
 * the same hand-written correspondence `packages/db/src/schema.ts` keeps with
 * the SQL, and it fails in the same visible way: an operator route parses its
 * own response, so a drift throws in the tests rather than reaching a caller.
 */
export const ingestionFlagSchema = z.object({
  kind: z.literal('artist_over_cap'),
  artist: z.string(),
  entries: z.number().int(),
}) satisfies z.ZodType<IngestionFlag>

/**
 * Flags are found whichever way the judgement goes.
 *
 * A week can breach the Compiler's cap *and* arrive half-scraped, and the run
 * that refused it is the only record that the breach was ever seen.
 */
export type Validation = { flags: IngestionFlag[] } & (
  | { ok: true; entries: SourceEntry[] }
  | { ok: false; reason: string }
)

export function validateChartWeek(
  entries: readonly SourceEntry[],
  chart: ArchivedChart,
): Validation {
  const flags = overCapArtists(entries)
  const reject = (reason: string): Validation => ({ ok: false, reason, flags })

  if (entries.length !== chart.positionCount) {
    return reject(
      `has ${entries.length} Entries; ${chart.slug} has ${chart.positionCount} Positions`,
    )
  }

  const seen = new Set<number>()
  for (const entry of entries) {
    const at = `at Position ${entry.position}`

    if (!isPositionOf(entry.position, chart.positionCount)) {
      return reject(
        `has an Entry at Position ${entry.position}, which ${chart.slug} does not have`,
      )
    }
    if (seen.has(entry.position)) return reject(`has two Entries ${at}`)
    seen.add(entry.position)

    if (entry.title.trim() === '') return reject(`has no Song title ${at}`)
    if (entry.artist.trim() === '') return reject(`has no Artist ${at}`)
    if (!Number.isInteger(entry.peakPosition)) {
      return reject(`reports no peak Position ${at}`)
    }
    if (!Number.isInteger(entry.weeksOnChart)) {
      return reject(`reports no weeks on Chart ${at}`)
    }
  }

  // Contiguity needs no check of its own. Exactly `positionCount` Entries,
  // each at a distinct Position no higher than that, is every Position from 1
  // — there is nowhere for a gap to hide. A week missing Position 63 is a week
  // that has 99 Entries, or one at a Position the Chart does not have, and the
  // loop above has already refused it.
  return {
    ok: true,
    entries: [...entries].sort((a, b) => a.position - b.position),
    flags,
  }
}

const isPositionOf = (position: number, positionCount: number): boolean =>
  Number.isInteger(position) && position >= 1 && position <= positionCount

/**
 * Artists over the Chart Compiler's three-per-week cap.
 *
 * Flagged, never enforced: Waveger consumes Charts and never compiles them, so
 * a breach of the Compiler's own rules is evidence about the source, not a
 * reason to throw away a published week.
 *
 * Counted by the credit as published. Which credits are the same Artist is the
 * Compiler's rule and not Waveger's (`CONTEXT.md`), so this counts what it was
 * given and does not go looking for the same person inside a longer credit.
 */
function overCapArtists(entries: readonly SourceEntry[]): IngestionFlag[] {
  const counts = new Map<string, { artist: string; entries: number }>()

  for (const entry of entries) {
    const key = normalisedName(entry.artist)
    const seen = counts.get(key)
    if (seen === undefined) {
      counts.set(key, { artist: entry.artist, entries: 1 })
    } else {
      seen.entries += 1
    }
  }

  return [...counts.values()]
    .filter((credit) => credit.entries > ENTRIES_PER_ARTIST_CAP)
    .map((credit) => ({ kind: 'artist_over_cap', ...credit }))
}
