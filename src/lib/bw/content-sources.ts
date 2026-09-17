/**
 * Multi-source content resolution for Bible text and audio.
 */

import type { SofriaSeq } from "../reader/sofria"

export interface VerseEntry {
  num: number
  text: string
}

const HELLOAO_API = "https://bible.helloao.org/api"
const DBT_PROXY = "/.netlify/functions/dbt-proxy"

/** helloAO's own `content[]` item shapes — see sofriaEmulate.ts's
 *  helloaoChapterToSofria for how these get turned into a SofriaDoc. */
export type HelloaoContentItem =
  | string
  | { text: string; poem?: number; wordsOfJesus?: boolean }
  | { lineBreak: true }
  | { noteId: number }

export type HelloaoChapterItem =
  | { type: "verse"; number: number; content: HelloaoContentItem[] }
  | { type: "heading"; content: string[] }
  | { type: "hebrew_subtitle"; content: string[] }
  | { type: "line_break" }
  | { type: string; [key: string]: unknown }

export interface HelloaoChapterJson {
  chapter: {
    number: number
    content: HelloaoChapterItem[]
    footnotes?: Array<{ noteId: number; caller?: string; text: string }>
  }
}

/**
 * Fetch ONE chapter's raw helloAO JSON — full structure (headings, poetry,
 * footnotes), unlike fetchHelloaoText above which flattens straight to
 * plain {num,text}[]. Feeds sofriaEmulate.ts's helloaoChapterToSofria so
 * this structure survives into the shared Sofria pipeline instead of being
 * discarded.
 */
export async function fetchHelloaoChapter(
  tid: string,
  book: string,
  chapter: number,
): Promise<HelloaoChapterJson | null> {
  try {
    const resp = await fetch(`${HELLOAO_API}/${tid}/${book}/${chapter}.json`)
    if (!resp.ok) return null
    const json = await resp.json()
    if (!Array.isArray(json?.chapter?.content)) return null
    return json as HelloaoChapterJson
  } catch {
    return null
  }
}

async function fetchDbtTextOnce(
  filesetId: string,
  book: string,
  chapter: number,
): Promise<VerseEntry[] | null> {
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
}

/**
 * Fetch text from DBT proxy. language-store.ts's loadLanguageData always
 * reconstructs a text fileset id as "<base><N|O>" (testament letter
 * appended), which is correct for languages whose text IS split per
 * testament (e.g. "AHRDPIN"/"AHRDPIO") — but some languages (e.g. French's
 * "FRNTLS") carry ONE combined fileset for both testaments, whose real id
 * is just the bare base id with no letter at all; the reconstructed,
 * lettered id 404s for those. Confirmed directly against the DBT API for
 * "FRNTLSO" (404) vs "FRNTLS" (200). Since media.json's own fileset.t field
 * can't distinguish the two conventions up front (it's always just the
 * base id either way), fall back to stripping the trailing letter after a
 * 404 rather than guessing in advance.
 */
export async function fetchDbtText(
  filesetId: string,
  book: string,
  chapter: number,
): Promise<VerseEntry[] | null> {
  try {
    const result = await fetchDbtTextOnce(filesetId, book, chapter)
    if (result) return result

    const strippedMatch = filesetId.match(/^(.+)[NO]$/)
    if (strippedMatch) {
      return await fetchDbtTextOnce(strippedMatch[1], book, chapter)
    }
    return null
  } catch {
    return null
  }
}

/**
 * Fetch DBT's native Sofria-structured text for a chapter, given the EXACT
 * text_json fileset id (from dbt-text-catalog.ts's dbtSofriaFilesetId —
 * NEVER guessed/reconstructed here; see that module's doc comment for why
 * a DBT fileset's real id can't be assumed to share a prefix with our own
 * resolved base id). Headings, poetry and footnotes intact, unlike the
 * flat verse-only text_plain filesets fetchDbtText reads. Schema-compatible
 * with PKF's own Proskomma sofria() output (both are the same upstream
 * Sofria spec — see sofria.ts's SofriaDoc), so chapter-doc.ts can use this
 * directly wherever it's available instead of falling back to
 * flatVersesToSofria.
 */
export async function fetchDbtSofria(
  jsonFilesetId: string,
  book: string,
  chapter: number,
): Promise<SofriaSeq | null> {
  try {
    const url = `${DBT_PROXY}?type=text&fileset_id=${jsonFilesetId}&book_id=${book}&chapter_id=${chapter}`
    const resp = await fetch(url)
    if (!resp.ok) return null

    const json = await resp.json()
    const rawData = Array.isArray(json) ? json : json.data || json
    const item = Array.isArray(rawData) ? rawData[0] : null
    const path = item?.path
    if (typeof path !== "string") return null

    // The fileset endpoint above only returns a signed URL pointing at the
    // actual structured file — a second, unauthenticated request (straight
    // to DBT's CDN, no proxy/key needed) fetches the real Sofria document.
    const fileResp = await fetch(path)
    if (!fileResp.ok) return null
    const doc = await fileResp.json()
    return doc?.sequence ?? null
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
