/**
 * Media availability + audio resolution from the `cdn.bibel.wiki` /dbt tree.
 *
 * Four CDN documents, in order of use:
 *   - `/dbt/<iso>/availability.json` — per-language rollup (bibles' join of
 *     their other catalogs — doc/language-availability.md): real
 *     verse-synced timing (`timingBooks`), text/audio presence, deduped
 *     cross-source editions. availabilityFor's primary source — covers
 *     1,970 of ~2,435 known languages as of 2026-09-15 (notably not yet
 *     Spanish), falling back to media-index.json below when absent.
 *   - `/dbt/_app/media-index.json` — global, compact, ~1,950 languages: which
 *     canons have audio (and, separately, text) and from which source(s).
 *     One fetch, drives picker badges. NO real timing signal at all (its
 *     "m" field is just "a" or "at" — audio vs. audio+text) — see
 *     decodeCanon's comment for a bug this caused when an earlier version
 *     of this code treated "t" here as a timing flag.
 *   - `/dbt/<iso>/media.json`      — per-language detail: every fileset per
 *     canon (translation id, text-fileset id, audio-fileset ids, sources).
 *   - `/dbt/<iso>/timing/<BOOK>.json` — per-book verse timing, keyed by audio
 *     fileset id: `{ [filesetId]: { [chapter]: { [verse]: [start, end] } } }`.
 *
 * Plus direct, keyless audio files at `/audio/<iso>/<filesetId>/<BOOK>_<ch>.mp3`
 * for languages whose canon sources include "contrib" (raw CDN-hosted audio,
 * no DBT key needed — see internal-docs/cdn-data-delivery-spec.md §6a).
 *
 * Source preference: PKF (Scripture Earth's own per-language audio, when
 * that language has it) > keyless raw (CDN file, no key) > dbt (proxy,
 * needs DBT_API_KEY). helloAO is text-only in general (never audio —
 * confirmed, not a temporary gap), so it isn't part of the normal audio
 * chain; see §6a of the delivery spec. (One real, explicit exception to
 * that — not a general helloAO tier — is documented further down.)
 *
 * resolveChapterAudioUrl is the ONE shared resolver for "real playable
 * audio for this iso+book+chapter" — used directly by the main reader
 * (Reader.svelte) and, since 2026-09-15, by the story-template reader too
 * (StoryReaderIsland.tsx, via ensureAudioSetup) — previously that path
 * kept its own separate, duplicate resolution logic (including a broken
 * helloAO-guessing tier that queried a DBT fileset id as if it were a
 * helloAO translation id, which could never actually succeed) that had
 * silently drifted out of sync with this one. Unified so a fix here (like
 * the helloAO-backed-edition case below) never needs making twice again.
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
import { shouldProbePkf } from "./language-list"
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
  /** Real, verse-synced timing exists for at least one book of this canon.
   *  Only ever true when sourced from /dbt/<iso>/availability.json's real
   *  `timingBooks` count (see availabilityFor below) — the bulk media-
   *  index fallback has no timing signal at all (its "m" field is just
   *  "a" or "at", audio vs. audio+text; a previous version of this code
   *  misread the "t" — text — as a timing flag, so a text-only edition
   *  with no real audio timing could get wrongly treated as "has timed
   *  audio" wherever this field was checked — confirmed live, 2026-09-15,
   *  as the likely cause of a real "text-only language wrongly offered
   *  for audio" bug report). Honestly false from that fallback rather
   *  than continuing that guess.
   */
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
  return { audio: media.includes("a"), timing: false, sources: parseSources(c.s) }
}

let mediaIndexPromise: Promise<Map<string, LanguageAvailability>> | null = null

/** The global availability index (~1,950 languages), fetched once. Used as
 *  availabilityFor's fallback for languages availability.json hasn't been
 *  published for yet (it covers 1,970 of ~2,435 known languages as of
 *  2026-09-15 — notably NOT yet Spanish, so this fallback still matters). */
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

// ── Per-language availability (/dbt/<iso>/availability.json) ────────────────

interface RawAvailCanon {
  sources?: string
  media?: string
  audioBooks?: number
  timingBooks?: number
}
interface RawAvailability {
  schema_version: number
  iso: string
  bible?: { nt?: RawAvailCanon; ot?: RawAvailCanon; ntp?: RawAvailCanon; otp?: RawAvailCanon }
}

function decodeAvailCanon(c: RawAvailCanon | undefined): CanonAvailability | undefined {
  if (!c) return undefined
  const media = c.media ?? ""
  return {
    audio: media.includes("a"),
    timing: !!(c.timingBooks && c.timingBooks > 0),
    sources: parseSources(c.sources),
  }
}

const availabilityCache = new Map<string, Promise<LanguageAvailability | null>>()

/**
 * Availability for one language — bibles' per-language rollup
 * (doc/language-availability.md), correctly distinguishing real
 * verse-synced timing (`timingBooks`) from mere text+audio presence,
 * unlike the bulk media-index (see decodeCanon's comment). Falls back to
 * the bulk index (loadMediaIndex) when this language has no
 * availability.json yet — not every known language is covered there.
 */
export async function availabilityFor(iso: string): Promise<LanguageAvailability | null> {
  const cached = availabilityCache.get(iso)
  if (cached) return cached
  const p = (async () => {
    try {
      const resp = await fetch(pkfUrl(`/dbt/${iso}/availability.json`))
      if (resp.ok) {
        const raw: RawAvailability = await resp.json()
        const names = await loadMediaIndex()
        const known = names.get(iso)
        return {
          name: known?.name ?? iso.toUpperCase(),
          vernacular: known?.vernacular,
          nt: decodeAvailCanon(raw.bible?.nt),
          ot: decodeAvailCanon(raw.bible?.ot),
        }
      }
    } catch {
      // fall through to the bulk-index fallback below
    }
    const idx = await loadMediaIndex()
    return idx.get(iso) ?? null
  })()
  availabilityCache.set(iso, p)
  return p
}

// ── Per-language media detail (/dbt/<iso>/media.json) ───────────────────────

export interface FilesetEntry {
  id: string
  media: string
  a?: string[] // audio fileset ids
  t?: string // text fileset id
  v11n?: string // versification scheme
  /** Present when this fileset's AUDIO isn't a real DBT edition at all —
   *  it looks like one (has an `a` id, sits in `filesets[]` normally) but
   *  that id 404s against the real DBT API; the real audio comes from
   *  `source` instead (currently always "helloao"). See the module doc
   *  comment's "helloAO-backed editions" section — this is the SAME case
   *  that comment describes for a preferredFileset id absent from
   *  `filesets[]` entirely, except media.json has since been backfilled to
   *  carry it directly on the normal entry instead (confirmed live for
   *  "ENGBSBHAY", 2026-09-16) — resolveChapterAudioUrl must check both. */
  audioSource?: { source: "helloao"; translation?: string; id?: string; reader?: string }
  /** Same idea as audioSource, for TEXT — not consumed by this file (audio-
   *  only), kept here only so callers reading FilesetEntry directly don't
   *  need a second, incompatible type. */
  textSource?: { source: "helloao"; id?: string; verified?: boolean }
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

// ── Audio URL resolution (whole-chapter) ─────────────────────────────────────

interface PkfAudioItem {
  bookCode?: string
  chapter?: number
  url?: string
}

const pkfAudioMediaCache = new Map<string, Promise<PkfAudioItem[] | null>>()

/**
 * Scripture Earth's own per-language audio, when that language has it —
 * checked first, ahead of raw/dbt, matching the priority order every other
 * "does language X have audio" decision in this app already uses (PKF >
 * everything else). "eng" never has PKF data (not a Scripture Earth
 * language) and shouldProbePkf(iso) says this language has no .pkf bundle
 * at all (config/pkf-langs.json's known 589-language list — the same gate
 * chapter-store.ts's loadPkfInfo and language-list.ts's other PKF checks
 * already use) — both skipped outright rather than spending a request
 * (and, for most languages with no PKF data, a guaranteed 404) finding
 * that out every time.
 */
async function loadPkfAudioItems(iso: string): Promise<PkfAudioItem[] | null> {
  const cached = pkfAudioMediaCache.get(iso)
  if (cached) return cached
  const p = (async () => {
    if (iso === "eng" || !(await shouldProbePkf(iso))) return null
    return fetch(pkfUrl(`/pkf/${iso}/info.json`))
      .then((r) => (r.ok ? r.json() : null))
      .then((info) => info?.media?.audio?.items ?? null)
      .catch(() => null)
  })()
  pkfAudioMediaCache.set(iso, p)
  return p
}

async function pkfAudioUrl(iso: string, bookCode: string, chapter: number): Promise<string | null> {
  const items = await loadPkfAudioItems(iso)
  const item = items?.find((i) => i.bookCode === bookCode && i.chapter === chapter)
  return item?.url ?? null
}

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
  source: "pkf" | "raw" | "dbt" | "helloao"
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

/**
 * A specific real DBT AUDIO fileset id to try first — for when DBT
 * publishes more than one recording of the very same edition and the
 * default one isn't the one wanted. Concrete case: French's "FRNTLS"
 * (Louis Segond) has both a dramatized recording (music/sound effects,
 * "FRNTLSN2DA" — what media.json surfaces and what resolveChapterAudioUrl
 * would otherwise pick) and a standard-narration one with none
 * ("FRNTLSN2SA") — confirmed live via catalog/audio.json, 2026-09-16;
 * media.json itself only ever lists one audio id per fileset, so this
 * split isn't visible anywhere else this app already reads. Distinct from
 * `preferredFileset` (which picks WHICH edition/fileset) — this picks
 * WHICH RECORDING of an edition already selected (by config or by being
 * the only option), so it's checked independently of whether a
 * preferredFileset is even configured for this canon.
 */
function preferredAudioId(iso: string, canon: "nt" | "ot"): string | null {
  const pref = (languagePreferences as Record<string, { preferredAudioId?: string | Record<string, string> }>)[iso]
    ?.preferredAudioId
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

// ── Preferring a non-drama ("SA") recording over a dramatized ("DA") one ────
//
// media.json's compact `a` array only ever lists ONE audio id per fileset,
// so it can't tell us a same-edition SA recording exists at all (confirmed
// live for French's "FRNTLS": media.json shows only "FRNTLSN2DA", but DBT's
// fuller catalog/audio.json also has "FRNTLSN2SA" — a real, separately
// fetchable, non-dramatized recording of the exact same translation).
// catalog/audio.json is DBT's full, all-language variant listing — fetched
// lazily (only once the dbt tier below is actually reached) and cached once
// per session; it's not a per-language slice (~400KB total), so this is
// deliberately NOT fetched for languages that resolve via PKF/helloAO/raw
// and never reach this tier at all.

interface RawAudioVariant { id: string; br?: number; c?: string; dbtTiming?: string }
interface RawAudioCatalog { entries: Record<string, Record<string, RawAudioVariant[]>> }

let audioCatalogPromise: Promise<RawAudioCatalog | null> | null = null

function loadDbtAudioCatalog(): Promise<RawAudioCatalog | null> {
  if (audioCatalogPromise) return audioCatalogPromise
  audioCatalogPromise = fetch(pkfUrl("/catalog/audio.json"))
    .then((r) => (r.ok ? (r.json() as Promise<RawAudioCatalog>) : null))
    .catch(() => null)
  return audioCatalogPromise
}

/** catalog/audio.json's compact id encoding (same convention as
 *  catalog-text.json — see dbt-timing.md's own note on this): "a:<suffix>"
 *  means append to distinctId, "A:<literal>" means already-complete. */
function decodeAudioVariantId(distinctId: string, variant: RawAudioVariant): string | null {
  if (variant.id.startsWith("A:")) return variant.id.slice(2)
  if (variant.id.startsWith("a:")) return `${distinctId}${variant.id.slice(2)}`
  return null
}

/** "FRNTLSN2DA" -> "FRNTLSN2SA" — DBT's own testament-letter + number +
 *  format-letter ('D'=drama, 'S'=standard) + 'A' convention. A CANDIDATE
 *  only, from a naming pattern — always confirmed against the real
 *  catalog/audio.json listing before ever being trusted (catalog-audio.md
 *  explicitly warns this app's whole ecosystem against guessing naming-
 *  convention matches instead of verifying), never used on the strength
 *  of the pattern alone. */
function daToSaCandidate(audioId: string): string | null {
  const m = audioId.match(/^(.*[NO]\d)D(A(?:-[a-z0-9]+)?)$/)
  return m ? `${m[1]}S${m[2]}` : null
}

/**
 * A same-edition, non-dramatized ("SA") sibling of a drama ("DA") DBT
 * audio fileset id, when — and only when — real, verified per-verse
 * timing has ALREADY been published for that exact SA id (loadBookTiming,
 * the confirmed answer — never DBT's own unverified `dbtTiming` catalog
 * claim, which catalog-audio.md explicitly warns is a weaker, unconfirmed
 * signal). Returns null (keep the DA id) whenever the SA sibling doesn't
 * exist, isn't a real catalog-confirmed variant, or has no confirmed
 * timing yet — which is every language as of 2026-09-17 (SA recordings
 * don't have published timing anywhere yet; confirmed for French, whose
 * real GEN/JHN timing files only have the DA id). This is therefore a
 * no-op everywhere today, and starts preferring SA automatically — with
 * no further code changes, for any language — the moment matching timing
 * is published for it.
 */
async function preferConfirmedNonDramaAudio(
  iso: string,
  canon: "nt" | "ot",
  distinctId: string,
  daAudioId: string,
  bookCode: string,
): Promise<string | null> {
  const candidate = daToSaCandidate(daAudioId)
  if (!candidate) return null

  const catalog = await loadDbtAudioCatalog()
  const variants = catalog?.entries?.[`${iso}:${canon}`]?.[distinctId]
  if (!variants) return null
  const realIds = variants.map((v) => decodeAudioVariantId(distinctId, v))
  if (!realIds.includes(candidate)) return null

  const timing = await loadBookTiming(iso, bookCode)
  if (!timing?.[candidate]) return null

  return candidate
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

  const debug = typeof window !== "undefined" && window.location.search.includes("readerdebug")
  if (debug) {
    console.log(`[readerdebug/audio] ${iso} ${bookCode} ${chapter}`, {
      canon, preferred, preferredInCatalog: preferred ? canonMedia.filesets.some((f) => f.id === preferred) : null,
      sources: [...sources], filesetIds: canonMedia.filesets.map((f) => f.id),
    })
  }

  // 0. A configured preferred fileset whose real audio isn't a DBT edition
  //    at all — checked first since an explicit preference should win
  //    outright once it resolves; a harmless no-op for every language
  //    without this kind of override. Two ways this shows up:
  //      (a) the fileset IS a normal catalog entry now, but carries an
  //          inline `audioSource` field marking its real source —
  //          media.json's own backfill of what used to only be
  //          discoverable via the sidecar below (confirmed live for
  //          "ENGBSBHAY", 2026-09-16: it started appearing directly in
  //          filesets[], and this tier hadn't been taught to check that
  //          yet, so it fell through to tier 3 below and 404'd trying to
  //          use "ENGBSBHAY" as if it were a real DBT fileset id).
  //      (b) the fileset isn't in the catalog at all yet — the sidecar
  //          (`align/<canon>/<iso>/<id>/_source.json`) is the only way to
  //          find it (media.json not backfilled for this edition yet).
  if (preferred) {
    const preferredFileset = canonMedia.filesets.find((f) => f.id === preferred)
    const inline = preferredFileset?.audioSource
    const sidecar = inline ? null : await loadHelloaoSource(canon, iso, preferred)
    if (debug && sidecar) console.log(`[readerdebug/audio] helloAO sidecar for ${preferred}:`, sidecar)
    const translationId = inline?.translation ?? inline?.id ?? sidecar?.audio?.translation ?? sidecar?.audio?.id
    const reader = inline?.reader ?? sidecar?.audio?.reader
    const isHelloao = inline?.source === "helloao" || sidecar?.audio?.source === "helloao"
    if (isHelloao && translationId && reader) {
      const chapterAudio = await fetchHelloaoChapterAudio(translationId, reader, bookCode, chapter)
      if (debug) console.log(`[readerdebug/audio] helloAO chapter fetch:`, chapterAudio)
      if (chapterAudio) {
        return { url: chapterAudio.url, filesetId: preferred, source: "helloao", verseStarts: chapterAudio.verseStarts }
      }
    }
  }

  // 1. PKF (Scripture Earth) — real per-language audio, when this language
  //    has it. Checked after the explicit-preference override above (that
  //    should always win outright once configured) but ahead of raw/dbt,
  //    matching this app's general "pkf > helloao > dbt" default priority.
  const pkfUrlResult = await pkfAudioUrl(iso, bookCode, chapter)
  if (pkfUrlResult) {
    if (debug) console.log(`[readerdebug/audio] resolved via pkf:`, pkfUrlResult)
    return { url: pkfUrlResult, filesetId: "", source: "pkf" }
  }

  // 2. Raw/contrib — direct CDN file, no key, tried against each fileset id
  //    (the /audio/ path segment matches the SAB fileset id, e.g. "NBS").
  if (sources.has("contrib")) {
    for (const f of filesets) {
      const url = await rawAudioUrl(iso, f.id, bookCode, chapter)
      if (url) {
        if (debug) console.log(`[readerdebug/audio] resolved via raw:`, f.id, url)
        return { url, filesetId: f.id, source: "raw" }
      }
    }
  }

  // 3. dbt-proxy (needs DBT_API_KEY) — per audio fileset id.
  // A configured preferredAudioId (a specific RECORDING, not edition —
  // see its own doc comment) wins outright over whichever one media.json
  // happened to surface, same "explicit config wins" spirit as the
  // preferredFileset checks above.
  const preferredAudio = preferredAudioId(iso, canon)
  if (preferredAudio) {
    const url = await fetchDbtAudioUrl(preferredAudio, bookCode, chapter)
    if (url) {
      if (debug) console.log(`[readerdebug/audio] resolved via preferred audio id:`, preferredAudio, url)
      return { url, filesetId: preferredAudio, source: "dbt" }
    }
  }
  // Skip filesets media.json itself already marked non-DBT (audioSource
  // set) — trying their "a" id against the real DBT API is a guaranteed
  // 404 (see tier 0's comment); tier 0 above already tried the preferred
  // one directly, so this only skips re-trying the SAME known-bad id (or
  // a different non-preferred helloAO-backed edition) here.
  for (const f of filesets) {
    if (f.audioSource) continue
    for (const audioId of f.a ?? []) {
      // Prefer a confirmed-real, confirmed-timed non-drama ("SA") sibling
      // over a dramatized ("DA") id, when one exists — see
      // preferConfirmedNonDramaAudio's own doc comment. A no-op today for
      // every language (no SA recording has confirmed timing yet), so
      // this always falls through to audioId unchanged right now.
      const preferred = await preferConfirmedNonDramaAudio(iso, canon, f.id, audioId, bookCode)
      const finalId = preferred ?? audioId
      const url = await fetchDbtAudioUrl(finalId, bookCode, chapter)
      if (url) {
        if (debug) {
          console.log(
            `[readerdebug/audio] resolved via dbt:`, finalId,
            preferred ? `(preferred non-drama over ${audioId})` : "",
            url,
          )
        }
        return { url, filesetId: finalId, source: "dbt" }
      }
    }
  }

  // 4. Raw CDN file again, this time unconditional on sources.has("contrib")
  //    — a last-resort fallback for bibles' small set of "legacy" historical
  //    audio+timing imports (confirmed 2026-09-15, Norwegian's "NBS": real
  //    audio+timing they still hold, but with NO live DBT fileset mapping —
  //    audioFilesetIds above (e.g. "NBSN2DA") 404s against the real DBT API
  //    and always will, yet the exact same raw path tier 2 already uses
  //    (keyed by the base fileset id, not the audio id) serves the real
  //    file: confirmed live, `/audio/nor/NBS/JHN_1.mp3` → 200. Tried last,
  //    after (not instead of) real DBT, since bibles says this case is rare
  //    (4 total across all languages) and every OTHER language's raw file,
  //    if any exists at this path, would already have been caught by tier 2
  //    via sources.has("contrib") — this is purely for languages sources
  //    doesn't flag as contrib-sourced at all.
  if (!sources.has("contrib")) {
    for (const f of filesets) {
      const url = await rawAudioUrl(iso, f.id, bookCode, chapter)
      if (url) {
        if (debug) console.log(`[readerdebug/audio] resolved via raw (legacy fallback):`, f.id, url)
        return { url, filesetId: f.id, source: "raw" }
      }
    }
  }

  if (debug) console.log(`[readerdebug/audio] no audio resolved at all`)
  return null
}
