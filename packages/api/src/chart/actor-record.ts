import type { SourceEntry } from './source'

/**
 * One record of the Apify actor, read for the five fields an Entry is made of.
 *
 * Shared by the live source and the fixture that replays stored runs, and that
 * sharing is the point: the fixture exists so the payload ingestion sees in a
 * test is the payload it will see in production, which is only true while both
 * are read the same way.
 *
 * Deliberately tolerant. A record missing a title yields a blank one rather
 * than an error, so that a half-scraped week is rejected as a *week* — visibly,
 * in one place, with the whole payload kept — instead of blowing up here.
 *
 * Two fields are read by nothing, on purpose (ADR 0002). `last_week` is null
 * for every descending Entry, so it reports the direction of a fall but never
 * its magnitude; movement is derived from Waveger's own archive instead.
 * `label` is always null, as the actor's own schema admits.
 */
export function toSourceEntry(record: unknown): SourceEntry {
  const fields = asFields(record)

  return {
    position: asNumber(fields.rank),
    title: asString(fields.title),
    artist: asString(fields.artist),
    peakPosition: asNumber(fields.peak_position),
    weeksOnChart: asNumber(fields.weeks_on_chart),
  }
}

/**
 * What the actor itself calls one record: a Chart, a Chart Week and a Position.
 *
 * Only used to stitch a resumed run onto the attempt before it, where the same
 * record can arrive from both. Not an identity Waveger keeps — a Song is
 * identified by fingerprint, and this is three strings off a scraper.
 */
export const recordKey = (record: unknown): string => {
  const fields = asFields(record)
  return `${String(fields.chart)}/${String(fields.chart_date)}/${String(fields.rank)}`
}

const asFields = (record: unknown): Record<string, unknown> =>
  typeof record === 'object' && record !== null
    ? (record as Record<string, unknown>)
    : {}

const asString = (value: unknown): string =>
  typeof value === 'string' ? value : ''

const asNumber = (value: unknown): number =>
  typeof value === 'number' ? value : Number.NaN
