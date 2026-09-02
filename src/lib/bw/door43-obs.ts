/**
 * Live client-side fetch + parse for door43-hosted Open Bible Stories
 * content (the OBS-UW template) — via cdn.bibel.wiki's OBS catalog.
 *
 * Three CDN documents (see doc/catalog-obs.md and doc/obs-media.md in
 * https://github.com/bcv-commons/bibles for the full, authoritative spec —
 * this implementation follows that doc directly, not a re-derivation from
 * raw responses):
 *   - `/catalog/obs-index.json` — global existence index. Row shape
 *     `[iso, "obs", source, media, count?]`, media "t" (text only) or
 *     "at" (audio+text). `iso` is ALWAYS ISO 639-3 here — the CDN
 *     normalizes door43's own raw 2-letter tags (36 of 214 languages)
 *     server-side, so this file never needs to translate between them.
 *     (Earlier versions of this file did their own 639-1→639-3 mapping
 *     against the OLD, un-normalized catalog — removed entirely now that
 *     normalization happens upstream; those old 2-letter CDN paths are
 *     being retired, not just supplemented.)
 *   - `/obs/<iso>/media.json` — per-language detail: resolved
 *     content_base_url, contentLayout ("md" for 197/214 languages, one
 *     file per story — or "ts-desktop" for 17/214, one file per
 *     paragraph, an older translationStudio format), per-story title +
 *     audio_url + segmentCount, license, checking_level, collectionTitle
 *     (only present for the 17 ts-desktop languages — see doc/obs-media.md,
 *     the standard layout's manifest title is always the fixed English
 *     string "Open Bible Stories", never translated).
 *   - `/obs/<iso>/timing.json` — per-story `{segment: [start, end]}`,
 *     genuinely lagging (depends on audio-sync's live alignment work) —
 *     check media.json's own `timingStories` before assuming this exists.
 *
 * media.json exists unconditionally for every catalog-obs-index.json
 * entry (both "t" and "at") — no staging-pipeline dependency, per the doc.
 */

import { pkfUrl } from "./pkf-url"

export interface ObsIndexEntry {
  hasText: boolean
  hasAudio: boolean
  /** Number of distinct door43 repos for this iso, when more than one
   *  (undefined/1 otherwise) — see media.json's own note on this. */
  repoCount?: number
}

export interface ObsStoryMedia {
  /** Own-language story title, parsed by the CDN from door43's story
   *  content (its first heading line, or title.txt for ts-desktop) — the
   *  one deliberate content-touch exception in this otherwise
   *  existence/routing-only catalog family. Present whenever resolved;
   *  absent for a genuine handful of stories with a blank heading on
   *  door43's own side (not a resolution failure — see doc/catalog-obs.md). */
  title?: string
  audio_url?: string
  /** Audio-sync's own narration-segment count claim, optional enrichment
   *  only present alongside audio_url — null/absent doesn't mean no audio. */
  segmentCount?: number
}

export type ObsContentLayout = "md" | "ts-desktop"

export interface ObsMedia {
  iso: string
  source: string
  source_repo: string
  content_base_url: string
  /** Which of the two fetch strategies to use for a story's actual text —
   *  see fetchDoor43Story below. Defaults to "md" if absent (older
   *  publishes may predate this field, per bcv-commons/bibles's own
   *  example code). */
  contentLayout?: ObsContentLayout
  license?: string
  checking_level?: string | null
  /** Vernacular collection name ("Open Bible Stories" in the visitor's own
   *  language) — ONLY present for the 17 ts-desktop-layout languages; the
   *  standard "md" layout's own manifest title is always the fixed,
   *  untranslated English string, so there's nothing to extract for the
   *  other 197 (not a gap — see doc/obs-media.md). */
  collectionTitle?: string
  storyCount: number
  audioStories: number
  timingStories: number
  audioStoriesSet?: string[]
  timingStoriesSet?: string[]
  stories: Record<string, ObsStoryMedia>
}

/** `{ [storyId]: { [segment]: [startSeconds, endSeconds] } }` */
export type ObsTiming = Record<string, Record<string, [number, number]>>

let indexPromise: Promise<Map<string, ObsIndexEntry>> | null = null

export function loadObsIndex(): Promise<Map<string, ObsIndexEntry>> {
  if (indexPromise) return indexPromise
  indexPromise = fetch(pkfUrl("/catalog/obs-index.json"))
    .then((r) => (r.ok ? r.json() : { entries: [] }))
    .then((data: { entries?: unknown[] }) => {
      const out = new Map<string, ObsIndexEntry>()
      for (const row of data.entries ?? []) {
        const [iso, , , media, count] = row as [string, string, string, string, number?]
        out.set(iso, {
          hasText: media.includes("t"),
          hasAudio: media.includes("a"),
          repoCount: count,
        })
      }
      return out
    })
    .catch(() => new Map())
  return indexPromise
}

const mediaCache = new Map<string, Promise<ObsMedia | null>>()

export function loadObsMedia(iso: string): Promise<ObsMedia | null> {
  const cached = mediaCache.get(iso)
  if (cached) return cached
  const p = fetch(pkfUrl(`/obs/${iso}/media.json`))
    .then((r) => (r.ok ? (r.json() as Promise<ObsMedia>) : null))
    .catch(() => null)
  mediaCache.set(iso, p)
  return p
}

const timingCache = new Map<string, Promise<ObsTiming | null>>()

export function loadObsTiming(iso: string): Promise<ObsTiming | null> {
  const cached = timingCache.get(iso)
  if (cached) return cached
  const p = fetch(pkfUrl(`/obs/${iso}/timing.json`))
    .then((r) => (r.ok ? (r.json() as Promise<Record<string, unknown>>) : null))
    .then((d) => {
      if (!d) return null
      const out: ObsTiming = {}
      for (const [k, v] of Object.entries(d)) {
        if (k === "iso") continue
        out[k] = v as ObsTiming[string]
      }
      return out
    })
    .catch(() => null)
  timingCache.set(iso, p)
  return p
}

export interface Door43Section {
  imageUrl: string
  text: string
}

export interface Door43Story {
  title: string
  sections: Door43Section[]
  /** The trailing "_Bible story: Genesis 1-2_"-style reference line OBS
   *  stories end with, own vernacular translation. Absent if not found
   *  (always absent for ts-desktop's separate reference.txt shape, which
   *  is folded into this same field for a uniform Door43Story either way). */
  bibleReference: string | null
}

const storyCache = new Map<string, Promise<Door43Story | null>>()

/**
 * Fetch and parse one OBS story's text+images, dispatching on
 * media.contentLayout — "md" (197/214 languages) or "ts-desktop" (17/214).
 * See doc/obs-media.md's "Fetching a story's text" for the spec this
 * follows directly.
 */
export function fetchDoor43Story(media: ObsMedia, storyId: string): Promise<Door43Story | null> {
  const key = `${media.content_base_url}/${storyId}/${media.contentLayout ?? "md"}`
  const cached = storyCache.get(key)
  if (cached) return cached

  const p =
    media.contentLayout === "ts-desktop"
      ? fetchTsDesktopStory(media, storyId)
      : fetchStandardStory(media, storyId)

  storyCache.set(key, p)
  return p
}

async function fetchStandardStory(media: ObsMedia, storyId: string): Promise<Door43Story | null> {
  try {
    const res = await fetch(`${media.content_base_url}/${storyId}.md`)
    if (!res.ok) return null
    return parseStandardStory(await res.text())
  } catch {
    return null
  }
}

/**
 * ts-desktop layout: one file per paragraph (`<content_base_url><storyId>/
 * <NN>.txt`), plus separate title.txt/reference.txt — no listing API, so
 * paragraphs are fetched sequentially until one 404s. No inline image URLs
 * in this layout (unlike "md"'s `![OBS Image](...)`) — OBS artwork is
 * shared across every translation of a story, so the standard
 * cdn.door43.org path is built directly instead, per doc/obs-media.md.
 */
async function fetchTsDesktopStory(media: ObsMedia, storyId: string): Promise<Door43Story | null> {
  const base = `${media.content_base_url}${storyId}/`
  const get = async (name: string): Promise<string | null> => {
    try {
      const r = await fetch(base + name)
      return r.ok ? await r.text() : null
    } catch {
      return null
    }
  }

  const title = await get("title.txt")
  const paragraphs: string[] = []
  for (let n = 1; ; n++) {
    const text = await get(`${String(n).padStart(2, "0")}.txt`)
    if (text === null) break
    paragraphs.push(text.trim())
  }
  if (paragraphs.length === 0 && !title) return null
  const reference = await get("reference.txt")

  const sections: Door43Section[] = paragraphs.map((text, i) => ({
    imageUrl: `https://cdn.door43.org/obs/jpg/360px/obs-en-${storyId}-${String(i + 1).padStart(2, "0")}.jpg`,
    text,
  }))

  return { title: (title ?? "").trim(), sections, bibleReference: reference?.trim() || null }
}

/**
 * Parse door43's standard OBS markdown shape:
 *   # N. Title
 *   ![OBS Image](url)
 *   paragraph text
 *   ![OBS Image](url)
 *   paragraph text
 *   ...
 *   _Bible story reference, own vernacular translation_
 *
 * Images are already full URLs (cdn.door43.org/...) — no path resolution
 * needed, unlike every other template's local index.toml image config.
 */
export function parseStandardStory(markdown: string): Door43Story {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n")

  let title = ""
  const sections: Door43Section[] = []
  let bibleReference: string | null = null

  let currentImage: string | null = null
  let currentTextLines: string[] = []

  const flush = () => {
    if (currentImage) {
      const text = currentTextLines.join("\n").trim()
      sections.push({ imageUrl: currentImage, text })
    }
    currentImage = null
    currentTextLines = []
  }

  for (const rawLine of lines) {
    const line = rawLine.trim()

    const titleMatch = line.match(/^#\s*(?:\d+\.\s*)?(.+)$/)
    if (titleMatch && !title) {
      title = titleMatch[1].trim()
      continue
    }

    const imageMatch = line.match(/^!\[[^\]]*\]\(([^)]+)\)$/)
    if (imageMatch) {
      flush()
      currentImage = imageMatch[1]
      continue
    }

    const refMatch = line.match(/^_(.+)_$/)
    if (refMatch && !line.startsWith("__")) {
      bibleReference = refMatch[1].trim()
      continue
    }

    if (line) currentTextLines.push(line)
  }
  flush()

  return { title, sections, bibleReference }
}
