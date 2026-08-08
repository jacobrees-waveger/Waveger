import { asFields, asNumber, asString } from './source-fields'
import type { SourceEntry } from './source'

/**
 * One row of the Chart Compiler's own chart list, read for the five fields an
 * Entry is made of.
 *
 * The Compiler's JSON is a view model for its website rather than a data
 * contract (ADR 0017), so most of what arrives on a row is presentation —
 * artwork at two sizes, a background colour, an audio preview, a link to a
 * page. Five fields are the Chart Week; the rest is the page it is drawn on.
 *
 * Deliberately tolerant, exactly as the Apify reader is. A row missing a title
 * yields a blank one rather than an error, so that a half-answered week is
 * rejected as a *week* — visibly, in one place, with the whole payload kept —
 * instead of blowing up here.
 *
 * Two fields are read by nothing, and this time on purpose rather than for want
 * of them. `lastWeek` is complete here where the actor left it null on every
 * descending Entry, and it stays unread: Movement is derived by self-joining
 * Waveger's own archive one Chart Week back, which is what makes correcting a
 * past week fix its neighbours (ADR 0012, ADR 0017). `artistUrl` carries the
 * Compiler's own Artist identity and belongs to the ticket that adds the Artist.
 */
export function toSourceEntry(item: unknown): SourceEntry {
  const fields = asFields(item)

  return {
    position: asNumber(fields.position),
    title: asString(fields.title),
    artist: asString(fields.artist),
    peakPosition: asNumber(fields.peak),
    weeksOnChart: asNumber(fields.weeks),
  }
}
