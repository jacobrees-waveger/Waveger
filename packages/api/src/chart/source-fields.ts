/**
 * Reading a field off whatever a source handed back, without judging it.
 *
 * Every `ChartSource` needs the same three coercions and every one of them has
 * to be tolerant in the same direction: a record missing a title yields a blank
 * one and a Position that is not a number yields `NaN`, so that a half-answered
 * week is rejected as a *week* — visibly, in one place, with the whole payload
 * kept — instead of blowing up in the reader.
 *
 * Shared because it is coercion and not parsing. Which fields an Entry is made
 * of, and what each source calls them, stays with each source: `actor-record.ts`
 * reads the actor's records, `chart-item.ts` the Compiler's rows, and neither
 * learns anything about the other from being handed the same `asString`.
 */

export const asFields = (value: unknown): Record<string, unknown> =>
  typeof value === 'object' && value !== null
    ? (value as Record<string, unknown>)
    : {}

export const asString = (value: unknown): string =>
  typeof value === 'string' ? value : ''

export const asNumber = (value: unknown): number =>
  typeof value === 'number' ? value : Number.NaN
