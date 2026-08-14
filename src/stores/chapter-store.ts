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

/**
 * Which tier resolved a chapter's text, and — for the two tiers with a
 * real, externally-known edition identifier — what that identifier is.
 * Populated alongside $chapterText, same cache key. Exists so callers that
 * need to know precisely which PUBLISHED EDITION of a language's text is on
 * screen (e.g. ParallelView.svelte's word-alignment feature, which needs to
 * fetch alignment data for that exact edition or not attempt it at all —
 * see wordAlignment.ts) can look it up without re-deriving the resolution
 * chapter-store.ts already did. "helloao" and "dbt" carry a real edition id
 * (the helloAO translation id / DBT distinct-id respectively — both are
 * externally-published identifiers, not internal to this app). "pkf" and
 * "contrib" don't: PKF bundles have no corresponding edition id in any
 * external alignment dataset, and contrib is this app's own local files.
 */
export const $chapterSource = atom<Record<string, { provider: string; id?: string } | null>>({})

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
  let source: { provider: string; id?: string } | null = null

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
          if (pkfVerses.length > 0) { verses = pkfVerses; source = { provider: "pkf" } }
        } catch { /* fall through */ }
      }
    }
  }

  // 2. Try BSB for English (helloAO's hosted copy of the same translation)
  if (!verses && langCode === "eng") {
    verses = await fetchHelloaoText("BSB", book, chapter)
    if (verses) source = { provider: "helloao", id: "BSB" }
  }

  // 3. Try contrib (local files)
  if (!verses) {
    const contribId = contribRegistry[langCode]
    if (contribId) {
      verses = loadContribText(langCode, contribId, book, chapter)
      if (verses) source = { provider: "contrib", id: contribId }
    }
  }

  // 4. Try helloao (free API, no key needed)
  if (!verses) {
    if (filesetId.startsWith("helloao:")) {
      const tid = filesetId.slice(8)
      verses = await fetchHelloaoText(tid, book, chapter)
      if (verses) source = { provider: "helloao", id: tid }
    } else {
      const distinctId = filesetId.replace(/(N[12]DA|[A-Z]{2}16|O[12]DA|S[12]DA)$/, "")
      const tid = await getHelloaoTid(distinctId)
      if (tid) {
        verses = await fetchHelloaoText(tid, book, chapter)
        if (verses) source = { provider: "helloao", id: tid }
      }
    }
  }

  // 5. Try DBT proxy — skip if we know the book isn't available
  if (!verses) {
    const pkfCat = pkfCatalogCache.get(langCode)
    if (!pkfCat?.checked || pkfCat.books.has(book)) {
      verses = await fetchDbtText(filesetId, book, chapter)
      if (verses) source = { provider: "dbt", id: filesetId }
    }
  }

  if (verses) {
    $chapterText.set({ ...existing, [cacheKey]: verses })
    $chapterSource.set({ ...$chapterSource.get(), [cacheKey]: source })
  }

  return verses
}

/** The provider/edition-id that resolved a chapter's text, if known — see
 *  $chapterSource's doc comment. Only meaningful after loadChapter has
 *  resolved (or attempted to resolve) this exact (book, chapter, langCode). */
export function getChapterSource(
  book: string,
  chapter: number,
  langCode: string,
): { provider: string; id?: string } | null {
  const cacheKey = `${langCode}-${book}.${chapter}`
  return $chapterSource.get()[cacheKey] ?? null
}

export function getChapterData(
  book: string,
  chapter: number,
  langCode: string,
): any {
  const cacheKey = `${langCode}-${book}.${chapter}`
  return $chapterText.get()[cacheKey] || null
}
