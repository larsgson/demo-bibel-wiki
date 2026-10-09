/**
 * Verse labels are strings — "1", "3a", "2-3", "17b-23" — exactly as the
 * source text numbers them (Sofria `verses` atts, the vendored extractor's
 * `verse`, PKF timing rows). They stay strings everywhere they are shown or
 * used as keys; these helpers are the one place that turns a label into
 * integers, for lookups by verse number (story ranges, verse jump, search and
 * audio highlight).
 */

export interface VerseRange {
  start: number
  end: number
}

// Bidi controls that RTL editions put around numbers (LRM, RLM, ALM,
// embeddings/overrides, isolates), and dash variants used for ranges.
const BIDI = /[‎‏؜‪-‮⁦-⁩]/g
const DASHES = /[‐-―−﹘﹣－]/g

/** "‏2–3 " → "2-3": bidi marks and spaces removed, dash variants unified. */
export function normalizeVerseLabel(label: string): string {
  return label.replace(BIDI, "").replace(DASHES, "-").replace(/\s+/g, "")
}

/** "17b-23" → {start: 17, end: 23}; "3a" → {3, 3}; "2,3" → {2, 3}.
 *  Null for anything that is not a verse number ("title", "none", "s1", ""). */
export function parseVerseLabel(label: string): VerseRange | null {
  const m = normalizeVerseLabel(label).match(/^(\d+)[a-z]?(?:[-,](\d+)[a-z]?)?$/i)
  if (!m) return null
  const start = parseInt(m[1], 10)
  const end = m[2] ? parseInt(m[2], 10) : start
  return end >= start ? { start, end } : { start, end: start }
}

/** The first verse a label covers ("3a" → 3, "2-3" → 2), or null. */
export function verseLabelStart(label: string): number | null {
  return parseVerseLabel(label)?.start ?? null
}

/** Does this label cover verse `n`? ("2-3" includes 2 and 3.) */
export function verseLabelIncludes(label: string, n: number): boolean {
  const r = parseVerseLabel(label)
  return !!r && r.start <= n && n <= r.end
}

/** Does this label share any verse with `from..to` (inclusive)? */
export function verseLabelOverlaps(label: string, from: number, to: number): boolean {
  const r = parseVerseLabel(label)
  return !!r && r.start <= to && from <= r.end
}
