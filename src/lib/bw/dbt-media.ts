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
 * Source preference is keyless-first: raw (CDN file) > helloao (free API) >
 * dbt (proxy, needs DBT_API_KEY). This mirrors §6a of the delivery spec.
 */

import { pkfUrl } from "./pkf-url"
import { getTestament } from "./bible-utils"
import { fetchDbtAudioUrl } from "./dbt-audio"

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

/**
 * Resolve a whole-chapter audio stream URL for (iso, book, chapter), trying
 * every fileset offered for that canon in listed order, keyless sources first.
 * Returns null when no source has audio for this chapter (e.g. OT chapter for
 * an NT-only recording, or the language has no audio at all).
 */
export async function resolveChapterAudioUrl(
  iso: string,
  bookCode: string,
  chapter: number,
): Promise<string | null> {
  const media = await loadLanguageMedia(iso)
  if (!media) return null
  const canon = getTestament(bookCode)
  const canonMedia = media.canons[canon]
  if (!canonMedia?.filesets?.length) return null

  const sources = new Set(canonMedia.sources ?? [])
  const audioFilesetIds = canonMedia.filesets.flatMap((f) => f.a ?? [])

  // 1. Raw/contrib — direct CDN file, no key, tried against each fileset id
  //    (the /audio/ path segment matches the SAB fileset id, e.g. "NBS").
  if (sources.has("contrib")) {
    for (const f of canonMedia.filesets) {
      const url = await rawAudioUrl(iso, f.id, bookCode, chapter)
      if (url) return url
    }
  }

  // 2. helloao (free) then 3. dbt-proxy (needs DBT_API_KEY) — per audio fileset id.
  for (const fileset of audioFilesetIds) {
    const url = await fetchDbtAudioUrl(fileset, bookCode, chapter)
    if (url) return url
  }

  return null
}
