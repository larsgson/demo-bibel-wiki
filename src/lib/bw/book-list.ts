/**
 * Per-language Bible book list with VERNACULAR names, for the left-pane Bible
 * navigation of non-.pkf (DBT/helloao) languages.
 *
 * Source: the free helloao API, which exposes vernacular book names + chapter
 * counts per translation (e.g. Spanish → "GÉNESIS", "SAN JUAN"). Returns null
 * when helloao has no translation for the language, so the caller can fall back
 * to generic names.
 */

import { getTestament } from "./bible-utils"
import books from "../../lib/bw/bible-books"
import { resolveTextSource } from "./source-catalog"

const HELLOAO_API = "https://bible.helloao.org/api"

// Standard 66-book codes — filter out any apocryphal/extra entries helloao may list.
const STANDARD = new Set(books.map((b) => b.code))

// helloao returns names in ALL CAPS ("SAN JUAN") — soften to title case if so.
function tidyName(name: string): string {
  if (name !== name.toLocaleUpperCase()) return name // already mixed case — keep
  return name
    .toLocaleLowerCase()
    .replace(/(^|\s)(\p{L})/gu, (_m, sp, ch) => sp + ch.toLocaleUpperCase())
}

export interface BookEntry {
  code: string
  name: string
  chapters: number
  ot: boolean
}

let translationsCache: any[] | null = null
async function helloaoTranslations(): Promise<any[]> {
  if (translationsCache) return translationsCache
  try {
    const r = await fetch(`${HELLOAO_API}/available_translations.json`)
    const d = await r.json()
    translationsCache = d.translations ?? []
  } catch {
    translationsCache = []
  }
  return translationsCache!
}

const bookListCache = new Map<string, BookEntry[] | null>()

export async function loadBookList(iso: string): Promise<BookEntry[] | null> {
  if (bookListCache.has(iso)) return bookListCache.get(iso)!

  // Build-time-resolved default (data/source-catalog.json) answers this
  // directly for the common case — falls back to the live, full-catalog
  // filter only when the catalog has no unambiguous helloAO id for this
  // language (see source-catalog.ts's "id left out when ambiguous" note).
  const resolved = await resolveTextSource(iso, "nt")
  let tid = resolved?.provider === "helloao" ? (resolved.id ?? null) : null
  if (!tid) {
    const tx = (await helloaoTranslations()).filter((t) => t.language === iso)
    tid = tx[0]?.id ?? null
  }
  if (!tid) {
    bookListCache.set(iso, null)
    return null
  }

  try {
    const r = await fetch(`${HELLOAO_API}/${tid}/books.json`)
    if (!r.ok) throw new Error(String(r.status))
    const d = await r.json()
    const list: BookEntry[] = (d.books ?? [])
      .filter((b: any) => STANDARD.has(b.id))
      .map((b: any) => ({
        code: b.id,
        name: tidyName(b.name),
        chapters: b.numberOfChapters,
        ot: getTestament(b.id) === "ot",
      }))
    const result = list.length ? list : null
    bookListCache.set(iso, result)
    return result
  } catch {
    bookListCache.set(iso, null)
    return null
  }
}
