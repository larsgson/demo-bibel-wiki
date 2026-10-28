/**
 * Verse timing for one chapter of audio, and PKF's part in it, following
 * bcv-commons/bibles' doc/dbt-timing.md and its sample client
 * tools/get-audio/get_audio.mjs.
 *
 * Timing comes from where it is made, first source that has it:
 *   1. PKF (se-regional-pwa), `pkf/<iso>/timing/<BOOK>-<chapter>.json`, for
 *      the DBT recording PKF timed and for PKF's own audio — often checked
 *      by hand, so it goes first;
 *   2. audio-sync's `align/` (dbt-media.ts loadAudioChapterTiming);
 *   3. DBT's timestamps, through dbt-proxy (ditto).
 *
 * PKF's audio items live in `pkf/<iso>/info.json` `media.audio.items`.
 * Items with `src` "h1", "h2"… stream DBT's audio (the fileset is in the
 * file name); the others are PKF's own audio (mostly scriptureearth.org),
 * listed in media.json as the edition `<ISO>PKF`.
 */

import { loadPkfInfo } from "./pkf-info"
import { pkfUrl } from "./pkf-url"

/** One chapter's verse timing: `{ [verse]: [startSec, endSec] }`. */
export type ChapterTiming = Record<string, [number, number]>

/** Verse start times in playback order → ChapterTiming. A verse ends where
 *  the next starts; the last one at the end of the audio (Infinity). */
export function timingFromStarts(starts: [string, number][]): ChapterTiming | null {
  const rows = starts.filter(([, t]) => Number.isFinite(t))
  if (!rows.length) return null
  const out: ChapterTiming = {}
  rows.forEach(([verse, start], i) => {
    out[verse] = [start, i + 1 < rows.length ? rows[i + 1][1] : Number.POSITIVE_INFINITY]
  })
  return out
}

// ── PKF ──────────────────────────────────────────────────────────────────────

export interface PkfAudioItem {
  filename?: string | null
  url?: string | null
  bookCode?: string | null
  chapter?: number | null
  timingFile?: string | null
  src?: string | null
  hasTiming?: boolean
}

export interface PkfAudioMedia {
  base_url?: string | null
  items?: PkfAudioItem[]
}

/** The edition / audio fileset id media.json gives PKF's own audio. */
export function pkfOwnId(iso: string): string {
  return `${iso.toUpperCase()}PKF`
}

/** The DBT audio fileset a PKF item streams, or null for PKF's own audio.
 *  File names carry it: B01___01_Matthew_____ACAWBTP2DA.mp3,
 *  BSNWBTN2DA_B03_LUK_001.mp3, or an old DAM id (…_N1IZZTBL.mp3 = IZZTBLN1DA). */
export function pkfItemFileset(item: PkfAudioItem): string | null {
  if (!String(item.src ?? "").startsWith("h")) return null
  const f = item.filename ?? ""
  let m = /_([NOP][12])([A-Z0-9]{6})\.mp3$/.exec(f)
  if (m) return m[2] + m[1] + "DA"
  m = /^([A-Z0-9]{10})_[AB]\d\d_/.exec(f) ?? /([A-Z0-9]{10})\.mp3$/.exec(f)
  return m?.[1] ?? null
}

/** The items of one chapter: by `timingFile` ("C01-02-MAT-01-timing.txt",
 *  any case) when present, else by `bookCode` and `chapter`. */
export function pkfItemsForChapter(items: PkfAudioItem[], book: string, chapter: number): PkfAudioItem[] {
  const cc = String(chapter).padStart(2, "0")
  return items.filter((i) => i.timingFile
    ? i.timingFile.toUpperCase().includes(`-${book}-${cc}-`)
    : String(i.bookCode ?? "").toUpperCase() === book && Number(i.chapter) === chapter)
}

/** The playable URL of PKF's own audio item: its `url`, else `base_url` +
 *  file name, else scriptureearth.org's folder for the language —
 *  percent-encoded (some file names have spaces). */
export function pkfOwnAudioUrl(iso: string, audio: PkfAudioMedia, item: PkfAudioItem): string | null {
  if (!item.url && !item.filename) return null
  const url = item.url ?? (audio.base_url
    ? `${audio.base_url.replace(/\/+$/, "")}/${item.filename}`
    : `https://www.scriptureearth.org/data/${iso}/audio/${item.filename}`)
  return encodeURI(url)
}

/** PKF timing rows (`[start, end, "1a"]` per verse part) → verse starts: a
 *  verse (or bridge, "1-2b") starts at its first part; "s2" and other
 *  non-verse rows are skipped. */
export function pkfRowsToStarts(rows: [number, number, string][]): [string, number][] {
  const seen = new Set<string>()
  const out: [string, number][] = []
  for (const [start, , label] of rows) {
    const v = /^\d+/.exec(String(label))?.[0]
    if (!v || seen.has(v)) continue
    seen.add(v)
    out.push([String(Number(v)), start])
  }
  return out
}

async function pkfChapterItems(iso: string, book: string, chapter: number): Promise<{ audio: PkfAudioMedia; items: PkfAudioItem[] }> {
  const info = await loadPkfInfo(iso)
  const audio: PkfAudioMedia = info?.media?.audio ?? {}
  return { audio, items: pkfItemsForChapter(audio.items ?? [], book, chapter) }
}

/** The DBT audio filesets PKF timed for one chapter (usually one: the
 *  recording PKF's app uses, often chosen by hand). */
export async function pkfTimedFilesets(iso: string, book: string, chapter: number): Promise<string[]> {
  const { items } = await pkfChapterItems(iso, book, chapter)
  return items.filter((i) => i.hasTiming).map(pkfItemFileset).filter((f): f is string => !!f)
}

/** PKF's own audio for one chapter, or null. */
export async function pkfOwnChapterAudio(iso: string, book: string, chapter: number): Promise<{ url: string; hasTiming: boolean } | null> {
  const { audio, items } = await pkfChapterItems(iso, book, chapter)
  const item = items.find((i) => !String(i.src ?? "").startsWith("h"))
  const url = item ? pkfOwnAudioUrl(iso, audio, item) : null
  return url ? { url, hasTiming: !!item!.hasTiming } : null
}

const pkfTimingCache = new Map<string, Promise<ChapterTiming | null>>()

/** PKF's timing of one chapter, when PKF timed exactly this audio: a DBT
 *  audio fileset it streams, or its own audio (`<ISO>PKF`). */
export function loadPkfChapterTiming(iso: string, audioFileset: string, book: string, chapter: number): Promise<ChapterTiming | null> {
  const key = `${iso}/${audioFileset}/${book}/${chapter}`
  const cached = pkfTimingCache.get(key)
  if (cached) return cached
  const p = (async () => {
    const timed = audioFileset === pkfOwnId(iso)
      ? (await pkfOwnChapterAudio(iso, book, chapter))?.hasTiming
      : (await pkfTimedFilesets(iso, book, chapter)).includes(audioFileset)
    if (!timed) return null
    try {
      const r = await fetch(pkfUrl(`/pkf/${iso}/timing/${book}-${chapter}.json`))
      return r.ok ? timingFromStarts(pkfRowsToStarts(await r.json())) : null
    } catch {
      return null
    }
  })()
  pkfTimingCache.set(key, p)
  return p
}
