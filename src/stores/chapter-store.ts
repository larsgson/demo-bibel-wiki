import { atom } from "nanostores"
import {
  loadContribText,
  fetchHelloaoText,
  fetchDbtText,
  getHelloaoTid,
} from "../lib/bw/content-sources"
import { chapterVerses } from "../lib/templates/verseText"
import { shouldProbePkf } from "../lib/bw/language-list"
import { pkfUrl as pkfUrlOf } from "../lib/bw/pkf-url"

// Cache key: "langCode-BOOK.chapter" e.g. "spa-JHN.1"
export const $chapterText = atom<Record<string, any>>({})

// Contrib registry: lang → contribId (e.g. "nor" → "NBS")
const contribRegistry: Record<string, string> = {
  nor: "NBS",
}


// Cache for PKF info.json lookups
const pkfInfoCache = new Map<string, any>()
// Cache which books each PKF language has
const pkfCatalogCache = new Map<string, { checked: boolean; books: Set<string> }>()

async function loadPkfInfo(langCode: string): Promise<any | null> {
  if (pkfInfoCache.has(langCode)) return pkfInfoCache.get(langCode)
  // Skip the probe for languages with no .pkf data on disk (avoids a 404).
  if (!(await shouldProbePkf(langCode))) { pkfInfoCache.set(langCode, null); return null }
  try {
    const resp = await fetch(pkfUrlOf(`/pkf/${langCode}/info.json`))
    if (!resp.ok) { pkfInfoCache.set(langCode, null); return null }
    const info = await resp.json()
    pkfInfoCache.set(langCode, info)
    return info
  } catch {
    pkfInfoCache.set(langCode, null)
    return null
  }
}

export async function loadChapter(
  book: string,
  chapter: number,
  filesetId: string,
  langCode: string,
): Promise<any> {
  const cacheKey = `${langCode}-${book}.${chapter}`
  const existing = $chapterText.get()
  if (existing[cacheKey]) return existing[cacheKey]

  let verses: any = null

  // 1. Try PKF data (Proskomma) for languages with PKF files
  if (!verses && langCode !== "eng") {
    const info = await loadPkfInfo(langCode)
    if (info) {
      const pkfAsset = info.assets?.find((a: any) => a.kind === "pkf")
      const catalogAsset = pkfAsset
        ? info.assets?.find((a: any) => a.kind === "json" && a.base === pkfAsset.base)
        : null
      if (pkfAsset) {
        try {
          const pkfUrl = pkfUrlOf(`/pkf/${langCode}/${pkfAsset.name}`)
          const catalogUrl = catalogAsset ? pkfUrlOf(`/pkf/${langCode}/${catalogAsset.name}`) : null
          let catalog = null
          if (catalogUrl) {
            const catResp = await fetch(catalogUrl)
            if (catResp.ok) {
              catalog = await catResp.json()
              const bookSet = new Set<string>(
                (catalog.documents || []).map((d: any) => d.bookCode)
              )
              pkfCatalogCache.set(langCode, { checked: true, books: bookSet })
            }
          }
          const pkfVerses = await chapterVerses(pkfAsset.base, pkfUrl, book, chapter, catalog)
          if (pkfVerses.length > 0) verses = pkfVerses
        } catch { /* fall through */ }
      }
    }
  }

  // 2. Try BSB for English (helloAO's hosted copy of the same translation)
  if (!verses && langCode === "eng") {
    verses = await fetchHelloaoText("BSB", book, chapter)
  }

  // 3. Try contrib (local files)
  if (!verses) {
    const contribId = contribRegistry[langCode]
    if (contribId) {
      verses = loadContribText(langCode, contribId, book, chapter)
    }
  }

  // 4. Try helloao (free API, no key needed)
  if (!verses) {
    if (filesetId.startsWith("helloao:")) {
      verses = await fetchHelloaoText(filesetId.slice(8), book, chapter)
    } else {
      const distinctId = filesetId.replace(/(N[12]DA|[A-Z]{2}16|O[12]DA|S[12]DA)$/, "")
      const tid = await getHelloaoTid(distinctId)
      if (tid) {
        verses = await fetchHelloaoText(tid, book, chapter)
      }
    }
  }

  // 5. Try DBT proxy — skip if we know the book isn't available
  if (!verses) {
    const pkfCat = pkfCatalogCache.get(langCode)
    if (!pkfCat?.checked || pkfCat.books.has(book)) {
      verses = await fetchDbtText(filesetId, book, chapter)
    }
  }

  if (verses) {
    $chapterText.set({ ...existing, [cacheKey]: verses })
  }

  return verses
}

export function getChapterData(
  book: string,
  chapter: number,
  langCode: string,
): any {
  const cacheKey = `${langCode}-${book}.${chapter}`
  return $chapterText.get()[cacheKey] || null
}
