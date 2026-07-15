/**
 * Verse-level audio timing for the PKF/Scripture-Earth audio path —
 * `pkf/<iso>/timing/<BOOK>-<chapter>.json` (CDN client-data spec §9).
 *
 * Each row is `[startSeconds, endSeconds, verseLabel]`, in playback order.
 * Delivered only for chapters that actually have it — a 404 means "no
 * verse-sync data for this chapter", not an error.
 */

import { pkfUrl } from "./pkf-url"

export type TimingRow = [number, number, string]

const timingCache = new Map<string, Promise<TimingRow[] | null>>()

export function loadChapterTiming(
  iso: string,
  bookCode: string,
  chapter: number,
): Promise<TimingRow[] | null> {
  const key = `${iso}/${bookCode}/${chapter}`
  const cached = timingCache.get(key)
  if (cached) return cached
  const p = fetch(pkfUrl(`/pkf/${iso}/timing/${bookCode}-${chapter}.json`))
    .then((r) => (r.ok ? (r.json() as Promise<TimingRow[]>) : null))
    .catch(() => null)
  timingCache.set(key, p)
  return p
}

/** True for a real verse label ("1", "3a"); false for a section/heading
 *  marker ("s1", "s2", …) — those narrate before the first verse and never
 *  correspond to a `versesByChapters` entry. */
export function isVerseLabel(label: string): boolean {
  return !/^s\d+$/.test(label)
}

/**
 * The verse label whose `[start, end)` window contains `t` seconds into
 * playback, or null between rows / before the first / after the last, or
 * when the row at `t` is a section marker (never highlight those).
 */
export function verseAtTime(rows: TimingRow[], t: number): string | null {
  for (const [start, end, label] of rows) {
    if (t >= start && t < end) return isVerseLabel(label) ? label : null
  }
  return null
}

/** Resolve a possibly sub-verse label ("3a"/"3b") down to its base verse
 *  number, for matching against the reader's `.verse-block[data-v]` DOM. */
export function baseVerseNumber(label: string): number | null {
  const m = label.match(/^(\d+)/)
  return m ? parseInt(m[1], 10) : null
}
