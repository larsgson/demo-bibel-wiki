/**
 * Multi-source content resolution for Bible text and audio.
 * Priority: contrib (local) → helloao (free API) → dbt (proxy)
 */

import { toHelloaoTranslationId } from "./helloao-crosswalk"

export interface VerseEntry {
  num: number
  text: string
}

// Import all contrib text files at build time via Vite glob import
const contribTextModules = import.meta.glob<string>(
  "/src/data/contrib/**/*.txt",
  { query: "?raw", import: "default", eager: true },
)

// Mapping from content-data distinct_id to helloao translation ID. Checked
// first (deliberately curated overrides), before the CDN's 1,256-entry
// crosswalk (/dbt/_helloao-crosswalk.json, see helloao-crosswalk.ts) — which
// covers everything else without needing a hand-maintained entry per language.
const HELLOAO_TID_MAP: Record<string, string> = {
  ENGWEB: "ENGWEBP",
  ENGNAS: "eng-NASB",
  ENGREV: "eng-rv",
}

const HELLOAO_API = "https://bible.helloao.org/api"
const DBT_PROXY = "/.netlify/functions/dbt-proxy"

/**
 * Load contrib text from build-time imported files.
 * Files: src/data/contrib/{LANG}_{ID}/{LANGID}_{BOOK}_{chapter}.txt (one verse per line)
 */
export function loadContribText(
  lang: string,
  contribId: string,
  book: string,
  chapter: number,
): VerseEntry[] | null {
  const filename = `${lang.toUpperCase()}${contribId}_${book}_${chapter}.txt`
  const key = `/src/data/contrib/${lang}_${contribId}/${filename}`
  const raw = contribTextModules[key]
  if (!raw) return null

  const lines = raw.split("\n").filter((l) => l.trim())
  return lines.map((line, i) => ({ num: i + 1, text: line.trim() }))
}

/**
 * Get contrib audio URL (local static path).
 */
export function getContribAudioUrl(
  lang: string,
  contribId: string,
  book: string,
  chapter: number,
): string {
  return `/audio/${lang}/${contribId}/${book}_${chapter}.mp3`
}

/**
 * Check if contrib audio file exists.
 */
export async function checkContribAudioExists(
  lang: string,
  contribId: string,
  book: string,
  chapter: number,
): Promise<boolean> {
  try {
    const url = getContribAudioUrl(lang, contribId, book, chapter)
    const resp = await fetch(url, { method: "HEAD" })
    return resp.ok
  } catch {
    return false
  }
}

/**
 * Flatten a helloao verse's `content` array to plain text. Items are either
 * plain strings (appended as-is — e.g. a footnote-adjacent closing quote,
 * which must NOT get an inserted space), `{ text, poem }` objects
 * (poetry/genealogy lines — consecutive poem lines aren't always separated
 * by an explicit lineBreak marker, e.g. Matthew 1:11's `poem: 1`→`poem: 2`
 * transition, so every `.text` object gets a trailing boundary space), or
 * `{ lineBreak: true }` / `{ noteId }` markers with no text of their own.
 */
export function helloaoVerseText(content: unknown[]): string {
  let out = ""
  for (const c of content) {
    if (typeof c === "string") out += c
    else if (c && typeof c === "object") {
      if (typeof (c as any).text === "string") out += (c as any).text + " "
      if ((c as any).lineBreak) out += " "
    }
  }
  return out.replace(/\s+/g, " ").trim()
}

/**
 * Fetch text from helloao API.
 */
export async function fetchHelloaoText(
  tid: string,
  book: string,
  chapter: number,
): Promise<VerseEntry[] | null> {
  try {
    const resp = await fetch(`${HELLOAO_API}/${tid}/${book}/${chapter}.json`)
    if (!resp.ok) return null
    const json = await resp.json()

    const content = json?.chapter?.content
    if (!Array.isArray(content)) return null

    return content
      .filter((item: any) => item.type === "verse" && item.number != null)
      .map((item: any) => ({
        num: item.number,
        text: Array.isArray(item.content)
          ? helloaoVerseText(item.content)
          : String(item.content || ""),
      }))
  } catch {
    return null
  }
}

/**
 * Fetch text from DBT proxy.
 */
export async function fetchDbtText(
  filesetId: string,
  book: string,
  chapter: number,
): Promise<VerseEntry[] | null> {
  try {
    const url = `${DBT_PROXY}?type=text&fileset_id=${filesetId}&book_id=${book}&chapter_id=${chapter}`
    const resp = await fetch(url)
    if (!resp.ok) return null

    const json = await resp.json()
    const rawData = Array.isArray(json) ? json : json.data || json
    if (!Array.isArray(rawData)) return rawData

    return rawData.map((v: any) => ({
      num: parseInt(v.verse_start || v.verse_end || "0", 10),
      text: v.verse_text || "",
    }))
  } catch {
    return null
  }
}

/**
 * Fetch audio URL from DBT proxy.
 */
export async function fetchDbtAudioUrl(
  filesetId: string,
  book: string,
  chapter: number,
): Promise<string | null> {
  try {
    const params = new URLSearchParams({
      type: "audio",
      fileset_id: filesetId,
      book_id: book,
      chapter_id: String(chapter),
    })
    const resp = await fetch(`${DBT_PROXY}?${params}`)
    if (!resp.ok) return null
    const json = await resp.json()
    return json.data?.[0]?.path || null
  } catch {
    return null
  }
}

/**
 * Resolve a helloao translation ID from a distinct_id (DBT-style text-fileset
 * id, e.g. "INDOBO", "ENGWEB"). Checks the hand-curated overrides first, then
 * the CDN's live crosswalk (1,256 entries, covers most languages without
 * needing a per-language entry here).
 */
export async function getHelloaoTid(distinctId: string): Promise<string | null> {
  const override = HELLOAO_TID_MAP[distinctId]
  if (override) return override
  return toHelloaoTranslationId(distinctId)
}
