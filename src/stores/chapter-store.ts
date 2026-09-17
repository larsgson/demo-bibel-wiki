import { atom } from "nanostores"
import { loadChapterVerses, getChapterSource as getChapterDocSource } from "../lib/bw/chapter-doc"

// Cache key: "langCode-BOOK.chapter" e.g. "spa-JHN.1"
export const $chapterText = atom<Record<string, any>>({})

export async function loadChapter(
  book: string,
  chapter: number,
  langCode: string,
): Promise<any> {
  const cacheKey = `${langCode}-${book}.${chapter}`
  const existing = $chapterText.get()
  if (existing[cacheKey]) return existing[cacheKey]

  const verses = await loadChapterVerses(langCode, book, chapter)
  if (verses) $chapterText.set({ ...existing, [cacheKey]: verses })

  return verses
}

/** The provider/edition-id that resolved a chapter's text, if known — see
 *  chapter-doc.ts's getChapterSource. Only meaningful after loadChapter has
 *  resolved (or attempted to resolve) this exact (book, chapter, langCode). */
export function getChapterSource(
  book: string,
  chapter: number,
  langCode: string,
): { provider: string; id?: string } | null {
  return getChapterDocSource(langCode, book, chapter)
}
