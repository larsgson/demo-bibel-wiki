/**
 * Multi-source content resolution for Bible text and audio.
 */

import type { SofriaSeq } from "../sofria/types"
import type { FlatVerse } from "../sofria/convert"

const HELLOAO_API = "https://bible.helloao.org/api"
const DBT_PROXY = "/.netlify/functions/dbt-proxy"

/** helloAO's own `content[]` item shapes — turned into Sofria by the
 *  vendored helloao_to_usj + usj_to_sofria_native (src/lib/sofria/vendor). */
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
 * footnotes). chapter-doc.ts turns it into Sofria with the vendored
 * helloAO converter, so this structure survives into the shared pipeline.
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
): Promise<FlatVerse[] | null> {
  const url = `${DBT_PROXY}?type=text&fileset_id=${filesetId}&book_id=${book}&chapter_id=${chapter}`
  const resp = await fetch(url)
  if (!resp.ok) return null

  const json = await resp.json()
  const rawData = Array.isArray(json) ? json : json.data || json
  if (!Array.isArray(rawData)) return rawData

  // A combined verse keeps its range as the label ("2-3"), like Sofria's own.
  return rawData.map((v: any) => {
    const start = String(v.verse_start ?? v.verse_end ?? "")
    const end = String(v.verse_end ?? "")
    return { label: end && end !== start ? `${start}-${end}` : start, text: v.verse_text || "" }
  })
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
): Promise<FlatVerse[] | null> {
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
 * Sofria spec — see src/lib/sofria/types.ts), so chapter-doc.ts can use this
 * directly wherever it's available instead of falling back to the flat
 * text_plain tier.
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
 * Fetch DBT's raw USX text for a WHOLE BOOK, given the EXACT text_usx
 * fileset id (from dbt-text-catalog.ts's dbtUsxFilesetId — never guessed,
 * same reasoning as fetchDbtSofria above). Unlike text_json/text_plain,
 * DBT delivers USX per book, not per chapter — confirmed live: fetching
 * chapter 1 vs chapter 5 of the same fileset/book returns the identical
 * path. `chapter` is only needed because the fileset endpoint requires
 * SOME chapter number; pass 1. Proskomma (already a dependency for PKF)
 * parses USX natively — see dbt-usx.ts, which imports this text into a
 * live docSet and queries sofria() off it exactly like PKF does, so this
 * function itself does no parsing at all, just returns the raw XML string.
 */
export async function fetchDbtUsx(filesetId: string, book: string): Promise<string | null> {
  try {
    const url = `${DBT_PROXY}?type=text&fileset_id=${filesetId}&book_id=${book}&chapter_id=1`
    const resp = await fetch(url)
    if (!resp.ok) return null

    const json = await resp.json()
    const rawData = Array.isArray(json) ? json : json.data || json
    const item = Array.isArray(rawData) ? rawData[0] : null
    const path = item?.path
    if (typeof path !== "string") return null

    const fileResp = await fetch(path)
    if (!fileResp.ok) return null
    return await fileResp.text()
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
