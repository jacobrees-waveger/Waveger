/**
 * Song identity, from the only two things a chart row carries.
 *
 * The Apify payload has no ISRC (ADR 0002), so a Song is identified by a
 * normalised fingerprint of its Artist and title. The normalisation is
 * deliberately conservative — case, whitespace and punctuation, nothing else —
 * because the two failure modes are not symmetrical. An over-aggressive rule
 * merges two distinct Songs into one history, which cannot be undone once
 * Entries point at it. An under-aggressive one splits a Song's history, which
 * is visible in the product and fixable by widening the rule later.
 *
 * So no accent folding, no stripping of "(feat. …)" or "- Radio Edit", no
 * reordering of credits. Those are all real duplicates and all beyond what can
 * be done without guessing.
 */
export function songFingerprint(artist: string, title: string): string {
  // Both halves reduce to letters, digits and single spaces, so the separator
  // cannot occur inside either one and cannot be forged by a title.
  return `${normalisedName(artist)}|${normalisedName(title)}`
}

/**
 * Everything that is not a letter or a digit becomes a single space — except
 * an apostrophe, which goes altogether.
 *
 * The two are opposite cases and the distinction is the whole rule. Punctuation
 * usually stands between words, so a space is what it leaves behind: `AC/DC`
 * and `AC DC` meet in the middle, and `Rock-n-Roll` does not become the single
 * word `rocknroll`. An apostrophe stands *inside* one, so removing it is what
 * makes `Don't` and `Dont` the same Song — and a space there would split every
 * elided title in the chart, which is a great many of them.
 */
export function normalisedName(value: string): string {
  return value
    .normalize('NFKC')
    .toLowerCase()
    .replace(/['’]/gu, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
}
