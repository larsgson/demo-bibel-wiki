/**
 * Multi-source content resolution for Bible text and audio.
 * Priority: contrib (local) → helloao (free API) → dbt (proxy)
 */

export interface VerseEntry {
  num: number
  text: string
}

// Import all contrib text files at build time via Vite glob import
const contribTextModules = import.meta.glob<string>(
  "/src/data/contrib/**/*.txt",
  { query: "?raw", import: "default", eager: true },
)

// Mapping from content-data distinct_id to helloao translation ID
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
          ? item.content
              .filter((c: any) => typeof c === "string")
              .join("")
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
 * Resolve helloao translation ID from a distinct_id.
 */
export function getHelloaoTid(distinctId: string): string | null {
  return HELLOAO_TID_MAP[distinctId] || null
}
