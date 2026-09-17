import { fetchSofria, type SofriaDoc } from "../reader/sofria"
import { extractVersesFromSofria } from "../reader/sofriaVerses"
import { helloaoChapterToSofria, flatVersesToSofria } from "../reader/sofriaEmulate"
import { isLoaded, loadDocSet } from "../reader/store"
import { loadPkfCatalog } from "./pkf-info"
import { fetchHelloaoChapter, fetchDbtText } from "./content-sources"
import { fetchOpenbibleChapter } from "./openbible-text"
import { getTestament } from "./bible-utils"
import { resolveTextEditions, type TextEdition } from "./text-edition"
import type { VerseEntry } from "../templates/types"

/**
 * THE single chapter-text fetch — every pane (main reader, story templates,
 * ParallelView) goes through this instead of maintaining its own fetch/tier
 * logic. Given (iso, book, chapter): resolve the canon's edition candidates
 * (text-edition.ts), try each in priority order, and return the first that
 * actually has this chapter as a SofriaDoc — native for PKF, emulated for
 * helloAO/DBT/openbible (sofriaEmulate.ts). See
 * internal-docs/unified-text-pipeline.md.
 */

export interface ChapterSource {
  provider: TextEdition["provider"]
  id: string
}

export interface ChapterDoc {
  doc: SofriaDoc
  source: ChapterSource
  edition: TextEdition
}

async function fetchDocFor(iso: string, edition: TextEdition, book: string, chapter: number): Promise<SofriaDoc | null> {
  switch (edition.provider) {
    case "pkf": {
      const pkf = edition.pkf
      if (!pkf) return null
      // Check the PKF catalog for this book BEFORE loading the (often
      // multi-MB) binary — avoids paying that cost for a canon this
      // language's docSet doesn't actually cover.
      const catalog = await loadPkfCatalog(iso)
      if (catalog && !catalog.documents.some((d) => d.bookCode === book)) return null
      try {
        if (!isLoaded(pkf.docSetId)) await loadDocSet(pkf.docSetId, pkf.pkfUrl)
        return fetchSofria(pkf.docSetId, book, chapter)
      } catch {
        return null
      }
    }
    case "helloao": {
      const json = await fetchHelloaoChapter(edition.id, book, chapter)
      if (!json) return null
      return helloaoChapterToSofria(json)
    }
    case "dbt": {
      const verses = await fetchDbtText(edition.id, book, chapter)
      if (!verses || verses.length === 0) return null
      return flatVersesToSofria(verses)
    }
    case "openbible": {
      const verses = await fetchOpenbibleChapter(iso, edition.id, book, chapter)
      if (!verses || verses.length === 0) return null
      return flatVersesToSofria(verses)
    }
  }
}

const docCache = new Map<string, Promise<SofriaDoc | null>>()
/** Which candidate index won last time, per (iso, canon) — tried first on
 *  the next call, falling back through the rest if it no longer resolves. */
const winnerIndex = new Map<string, number>()
/** Sync lookup for ParallelView's word-alignment feature — see
 *  wordAlignment.ts's translationIdForSource. */
const winnerSource = new Map<string, ChapterSource>()

function debugOn(): boolean {
  return typeof window !== "undefined" && window.location.search.includes("readerdebug")
}

export async function loadChapterDoc(iso: string, book: string, chapter: number): Promise<ChapterDoc | null> {
  const canon = getTestament(book)
  const editions = await resolveTextEditions(iso, canon)
  if (editions.length === 0) return null

  const winKey = `${iso}:${canon}`
  const startAt = winnerIndex.get(winKey) ?? 0
  const order = [...editions.slice(startAt), ...editions.slice(0, startAt)]

  for (const edition of order) {
    const cacheKey = `${iso}:${edition.provider}:${edition.id}:${book}.${chapter}`
    let docPromise = docCache.get(cacheKey)
    if (!docPromise) {
      docPromise = fetchDocFor(iso, edition, book, chapter)
      docCache.set(cacheKey, docPromise)
    }
    const doc = await docPromise
    if (debugOn()) {
      console.log(`[readerdebug/chapter-doc] ${iso} ${book} ${chapter} try ${edition.provider}:${edition.id} ->`, !!doc)
    }
    if (doc) {
      const realIdx = editions.indexOf(edition)
      winnerIndex.set(winKey, realIdx)
      const source: ChapterSource = { provider: edition.provider, id: edition.id }
      winnerSource.set(`${iso}-${book}.${chapter}`, source)
      return { doc, source, edition }
    }
  }
  return null
}

export async function loadChapterVerses(iso: string, book: string, chapter: number): Promise<VerseEntry[] | null> {
  const res = await loadChapterDoc(iso, book, chapter)
  return res ? extractVersesFromSofria(res.doc) : null
}

/** The provider/edition-id that resolved a chapter's text, if known — only
 *  meaningful after loadChapterDoc has resolved (or attempted to resolve)
 *  this exact (iso, book, chapter). Consumed by ParallelView's word
 *  alignment (wordAlignment.ts). */
export function getChapterSource(iso: string, book: string, chapter: number): ChapterSource | null {
  return winnerSource.get(`${iso}-${book}.${chapter}`) ?? null
}

/** Fire-and-forget speculative fetch — safe to call often, same dedup as
 *  loadChapterDoc itself. */
export function prefetchChapterDoc(iso: string, book: string, chapter: number): void {
  loadChapterDoc(iso, book, chapter).catch(() => {
    // Speculative — a failure here just means a later real call pays the
    // cost itself, same as if this prefetch never ran.
  })
}
