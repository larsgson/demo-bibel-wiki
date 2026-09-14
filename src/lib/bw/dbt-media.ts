/**
 * Media availability + audio resolution from the `cdn.bibel.wiki` /dbt tree.
 *
 * Three CDN documents, in order of use:
 *   - `/dbt/_app/media-index.json` — global, compact, ~1,950 languages: which
 *     canons have audio/timing and from which source(s). One fetch, drives
 *     picker badges.
 *   - `/dbt/<iso>/media.json`      — per-language detail: every fileset per
 *     canon (translation id, text-fileset id, audio-fileset ids, sources).
 *   - `/dbt/<iso>/timing/<BOOK>.json` — per-book verse timing, keyed by audio
 *     fileset id: `{ [filesetId]: { [chapter]: { [verse]: [start, end] } } }`.
 *
 * Plus direct, keyless audio files at `/audio/<iso>/<filesetId>/<BOOK>_<ch>.mp3`
 * for languages whose canon sources include "contrib" (raw CDN-hosted audio,
 * no DBT key needed — see internal-docs/cdn-data-delivery-spec.md §6a).
 *
 * Source preference is keyless-first: raw (CDN file, no key) > dbt (proxy,
 * needs DBT_API_KEY). helloAO is text-only (never audio — confirmed, not a
 * temporary gap), so it isn't part of the audio chain; see §6a of the
 * delivery spec.
 *
 * WITHIN whichever tier actually has a fileset, ../../data/language-
 * preferences.json's `preferredFileset` (iso -> base fileset id, e.g.
 * "EN1ESV", or per-canon {nt,ot}) moves that edition's fileset to the front
 * of the list `resolveChapterAudioUrl` tries — same config knob the OBS/
 * story-template path (language-store.ts, StoryReaderIsland.tsx) already
 * uses. Never widens WHICH tier is tried (raw still always wins over dbt),
 * only reorders within one — EXCEPT for one new case, see below.
 *
 * ── helloAO-backed editions (not real DBT editions) ─────────────────────
 * bcv-commons/bibles' doc/dbt-timing.md (redesigned 2026-09-14) documents
 * a real exception: some editions look like they belong in the DBT
 * fileset list but their actual audio/text comes from helloAO instead —
 * currently one confirmed case, English's "ENGBSBHAY" (Berean Standard
 * Bible, helloAO's "hays" narration), which as of this writing has real
 * audio AND real per-verse timing, but isn't a DBT edition at all (its
 * `media.json` fileset entry, once backfilled, carries `audioSource: {
 * source: "helloao", translation, reader }` instead of resolving through
 * DBT). `media.json` itself hadn't been backfilled with this entry yet as
 * of 2026-09-14, so `preferredFileset` pointing at an id NOT present in
 * the canon's `filesets[]` at all is treated as a possible helloAO-backed
 * edition: `loadHelloaoSource` checks the per-edition sidecar
 * (`align/<canon>/<iso>/<id>/_source.json`, confirmed live independent of
 * `media.json`'s own catch-up), and if it resolves, `fetchHelloaoChapterAudio`
 * fetches the ACTUAL audio URL + real per-verse start times directly from
 * helloAO's own per-chapter API (`thisChapterAudioLinks`/
 * `thisChapterAudioTimings`) — a source dbt-media.ts otherwise treats as
 * text-only (see the "No helloAO tier" note below, which still holds for
 * every OTHER helloAO translation; BSB/hays is the one real exception).
 */

import { pkfUrl } from "./pkf-url"
import { getTestament } from "./bible-utils"
import { fetchDbtAudioUrl } from "./dbt-audio"
import languagePreferences from "../../data/language-preferences.json"

const HELLOAO_API_BASE = "https://bible.helloao.org"

export type MediaSource = "raw" | "helloao" | "dbt" | "ebible"

const SOURCE_CODE: Record<string, MediaSource> = { r: "raw", h: "helloao", d: "dbt", e: "ebible" }

function parseSources(s: string | undefined): MediaSource[] {
  if (!s) return []
  const out: MediaSource[] = []
  for (const ch of s) {
    const src = SOURCE_CODE[ch]
    if (src) out.push(src)
  }
  return out
}

export interface CanonAvailability {
  audio: boolean
  timing: boolean
  sources: MediaSource[]
}

export interface LanguageAvailability {
  name: string
  vernacular?: string
  nt?: CanonAvailability
  ot?: CanonAvailability
}

interface RawCanonEntry { m?: string; s?: string }
interface RawLangEntry { n?: RawCanonEntry; o?: RawCanonEntry; nm: string; v?: string }
interface RawMediaIndex { time: string; l: Record<string, RawLangEntry> }

function decodeCanon(c: RawCanonEntry | undefined): CanonAvailability | undefined {
  if (!c) return undefined
  const media = c.m ?? ""
  return { audio: media.includes("a"), timing: media.includes("t"), sources: parseSources(c.s) }
}

let mediaIndexPromise: Promise<Map<string, LanguageAvailability>> | null = null

/** The global availability index (~1,950 languages), fetched once. */
export function loadMediaIndex(): Promise<Map<string, LanguageAvailability>> {
  if (mediaIndexPromise) return mediaIndexPromise
  mediaIndexPromise = fetch(pkfUrl("/dbt/_app/media-index.json"))
    .then((r) => (r.ok ? (r.json() as Promise<RawMediaIndex>) : { time: "", l: {} }))
    .then((raw) => {
      const out = new Map<string, LanguageAvailability>()
      for (const [iso, e] of Object.entries(raw.l ?? {}) as [string, RawLangEntry][]) {
        out.set(iso, { name: e.nm, vernacular: e.v, nt: decodeCanon(e.n), ot: decodeCanon(e.o) })
      }
      return out
    })
    .catch(() => new Map())
  return mediaIndexPromise
}

/** Availability for one language from the already-loaded global index. */
export async function availabilityFor(iso: string): Promise<LanguageAvailability | null> {
  const idx = await loadMediaIndex()
  return idx.get(iso) ?? null
}

// ── Per-language media detail (/dbt/<iso>/media.json) ───────────────────────

export interface FilesetEntry {
  id: string
  media: string
  a?: string[] // audio fileset ids
  t?: string // text fileset id
  v11n?: string // versification scheme
}

export interface CanonMedia {
  media: string
  sources?: string[]
  filesets?: FilesetEntry[]
  h?: string[] // helloao translation ids
  timingBooks?: number
}

export interface LanguageMedia {
  iso: string
  canons: { nt?: CanonMedia; ot?: CanonMedia }
}

const mediaCache = new Map<string, Promise<LanguageMedia | null>>()

export function loadLanguageMedia(iso: string): Promise<LanguageMedia | null> {
  const cached = mediaCache.get(iso)
  if (cached) return cached
  const p = fetch(pkfUrl(`/dbt/${iso}/media.json`))
    .then((r) => (r.ok ? (r.json() as Promise<LanguageMedia>) : null))
    .catch(() => null)
  mediaCache.set(iso, p)
  return p
}

// ── Per-book verse timing (/dbt/<iso>/timing/<BOOK>.json) ───────────────────

/** `{ [audioFilesetId]: { [chapter]: { [verse]: [startSec, endSec] } } }` */
export type BookTiming = Record<string, Record<string, Record<string, [number, number]>>>

const timingCache = new Map<string, Promise<BookTiming | null>>()

export function loadBookTiming(iso: string, bookCode: string): Promise<BookTiming | null> {
  const key = `${iso}/${bookCode}`
  const cached = timingCache.get(key)
  if (cached) return cached
  const p = fetch(pkfUrl(`/dbt/${iso}/timing/${bookCode}.json`))
    .then((r) => (r.ok ? (r.json() as Promise<Record<string, unknown>>) : null))
    .then((d) => {
      if (!d) return null
      // Strip the non-fileset "iso"/"book" string fields, keep fileset→chapter→verse maps.
      const out: BookTiming = {}
      for (const [k, v] of Object.entries(d)) {
        if (k === "iso" || k === "book") continue
        out[k] = v as BookTiming[string]
      }
      return out
    })
    .catch(() => null)
  timingCache.set(key, p)
  return p
}

// ── Audio URL resolution (whole-chapter, keyless-first) ─────────────────────

async function rawAudioUrl(iso: string, filesetId: string, bookCode: string, chapter: number): Promise<string | null> {
  const url = pkfUrl(`/audio/${iso}/${filesetId}/${bookCode}_${chapter}.mp3`)
  try {
    const r = await fetch(url, { method: "HEAD" })
    return r.ok ? url : null
  } catch {
    return null
  }
}

export interface ResolvedAudio {
  url: string
  /** The fileset id the URL was resolved against — needed to look up verse
   *  timing (loadBookTiming's result is keyed by this same id, but only for
   *  source "dbt": raw/contrib fileset ids follow a different, non-DBT
   *  naming scheme and aren't guaranteed to appear in the DBT timing file). */
  filesetId: string
  source: "raw" | "dbt" | "helloao"
  /** Only for source "helloao" — real per-verse start times (seconds),
   *  index 0 = verse 1, straight from helloAO's own thisChapterAudioTimings
   *  (NOT audio-sync's; a completely separate timing source, fetched
   *  alongside the audio URL in the same call since both come from the
   *  same per-chapter response). null when helloAO had no timing for this
   *  specific chapter — the audio URL is still usable without it. */
  verseStarts?: number[] | null
}

/**
 * Resolve a whole-chapter audio stream URL for (iso, book, chapter), trying
 * every fileset offered for that canon in listed order, keyless sources first.
 * Returns null when no source has audio for this chapter (e.g. OT chapter for
 * an NT-only recording, or the language has no audio at all).
 *
 * No general helloAO tier: helloAO's `thisChapterAudioLinks` field exists
 * in the schema but is unpopulated for nearly every translation — BSB
 * (helloAO's "hays" narration) is the one confirmed real exception, and is
 * only ever probed here when explicitly configured via `preferredFileset`
 * (tier 0 below), never scanned for generally — that would cost a real
 * network round-trip on every resolution for a source that almost never
 * answers.
 */
/** ../../data/language-preferences.json's `preferredFileset` for one
 *  (iso, canon) — a base fileset id (matching FilesetEntry.id, e.g.
 *  "EN1ESV"), not an audio/text-specific id. Same shape/lookup
 *  language-store.ts's loadLanguageData() already uses. */
function preferredFilesetId(iso: string, canon: "nt" | "ot"): string | null {
  const pref = (languagePreferences as Record<string, { preferredFileset?: string | Record<string, string> }>)[iso]
    ?.preferredFileset
  if (!pref) return null
  return typeof pref === "string" ? pref : pref[canon] ?? null
}

/** Move the preferred fileset (if configured and present) to the front,
 *  otherwise leave the CDN's own listed order untouched. Array.sort is
 *  stable, so this never reorders anything else. */
function orderedByPreference(filesets: FilesetEntry[], preferred: string | null): FilesetEntry[] {
  if (!preferred) return filesets
  return [...filesets].sort((a, b) => (a.id === preferred ? -1 : b.id === preferred ? 1 : 0))
}

interface HelloaoSourceRef {
  source: string
  /** NT/OT canon field is "translation" in the audio half of the sidecar,
   *  "id" in the text half — same value either way (a helloAO translation
   *  id, e.g. "BSB"). Accept both so callers don't need to know which half
   *  they're reading. */
  translation?: string
  id?: string
  reader?: string
  verified?: boolean
}

interface HelloaoBackedSource {
  audio?: HelloaoSourceRef
  text?: HelloaoSourceRef
}

const helloaoSourceCache = new Map<string, Promise<HelloaoBackedSource | null>>()

/** `align/<canon>/<iso>/<distinctId>/_source.json` — see the module doc
 *  comment above. Exists independently of media.json's own filesets[]
 *  entry for the same id, so this resolves a configured-but-not-yet-
 *  cataloged edition today. */
function loadHelloaoSource(canon: "nt" | "ot", iso: string, distinctId: string): Promise<HelloaoBackedSource | null> {
  const key = `${canon}/${iso}/${distinctId}`
  const cached = helloaoSourceCache.get(key)
  if (cached) return cached
  const p = fetch(pkfUrl(`/align/${canon}/${iso}/${distinctId}/_source.json`))
    .then((r) => (r.ok ? (r.json() as Promise<HelloaoBackedSource>) : null))
    .catch(() => null)
  helloaoSourceCache.set(key, p)
  return p
}

interface HelloaoChapterAudio {
  url: string
  verseStarts: number[] | null
}

const helloaoChapterCache = new Map<string, Promise<HelloaoChapterAudio | null>>()

/** One chapter's real audio URL + real per-verse start times, straight
 *  from helloAO's own per-chapter API — thisChapterAudioLinks[reader] for
 *  the URL, thisChapterAudioTimings[reader] (a relative link to a SECOND
 *  small JSON file, `{ verses: number[], ... }`) for timing. Both are
 *  top-level fields on the chapter response, not nested under "chapter". */
function fetchHelloaoChapterAudio(
  translationId: string,
  reader: string,
  bookCode: string,
  chapter: number,
): Promise<HelloaoChapterAudio | null> {
  const key = `${translationId}/${reader}/${bookCode}/${chapter}`
  const cached = helloaoChapterCache.get(key)
  if (cached) return cached
  const p = (async (): Promise<HelloaoChapterAudio | null> => {
    try {
      const res = await fetch(`${HELLOAO_API_BASE}/api/${translationId}/${bookCode}/${chapter}.json`)
      if (!res.ok) return null
      const data = await res.json()
      const url: string | undefined = data?.thisChapterAudioLinks?.[reader]
      if (!url) return null

      let verseStarts: number[] | null = null
      const timingsPath: string | undefined = data?.thisChapterAudioTimings?.[reader]
      if (timingsPath) {
        try {
          const timingsRes = await fetch(`${HELLOAO_API_BASE}${timingsPath}`)
          if (timingsRes.ok) {
            const timingsData = await timingsRes.json()
            if (Array.isArray(timingsData?.verses)) verseStarts = timingsData.verses
          }
        } catch {
          // Audio is still usable without timing — no highlighting, that's all.
        }
      }
      return { url, verseStarts }
    } catch {
      return null
    }
  })()
  helloaoChapterCache.set(key, p)
  return p
}

export async function resolveChapterAudioUrl(
  iso: string,
  bookCode: string,
  chapter: number,
): Promise<ResolvedAudio | null> {
  const media = await loadLanguageMedia(iso)
  if (!media) return null
  const canon = getTestament(bookCode)
  const canonMedia = media.canons[canon]
  if (!canonMedia?.filesets?.length) return null

  const sources = new Set(canonMedia.sources ?? [])
  const preferred = preferredFilesetId(iso, canon)
  const filesets = orderedByPreference(canonMedia.filesets, preferred)

  // 0. A configured preferred fileset that isn't a real catalog entry at
  //    all yet — check whether it's a helloAO-backed edition (see the
  //    module doc comment) before falling through to the normal tiers.
  //    Checked first since an explicit preference should win outright
  //    once it resolves; a harmless one-request no-op (404) for every
  //    language without this kind of override.
  if (preferred && !canonMedia.filesets.some((f) => f.id === preferred)) {
    const src = await loadHelloaoSource(canon, iso, preferred)
    const translationId = src?.audio?.translation ?? src?.audio?.id
    if (src?.audio?.source === "helloao" && translationId && src.audio.reader) {
      const chapterAudio = await fetchHelloaoChapterAudio(translationId, src.audio.reader, bookCode, chapter)
      if (chapterAudio) {
        return { url: chapterAudio.url, filesetId: preferred, source: "helloao", verseStarts: chapterAudio.verseStarts }
      }
    }
  }

  // 1. Raw/contrib — direct CDN file, no key, tried against each fileset id
  //    (the /audio/ path segment matches the SAB fileset id, e.g. "NBS").
  if (sources.has("contrib")) {
    for (const f of filesets) {
      const url = await rawAudioUrl(iso, f.id, bookCode, chapter)
      if (url) return { url, filesetId: f.id, source: "raw" }
    }
  }

  // 2. dbt-proxy (needs DBT_API_KEY) — per audio fileset id.
  const audioFilesetIds = filesets.flatMap((f) => f.a ?? [])
  for (const fileset of audioFilesetIds) {
    const url = await fetchDbtAudioUrl(fileset, bookCode, chapter)
    if (url) return { url, filesetId: fileset, source: "dbt" }
  }

  return null
}
