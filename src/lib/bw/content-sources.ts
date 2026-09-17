/**
 * Multi-source content resolution for Bible text and audio.
 */

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
