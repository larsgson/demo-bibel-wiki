/**
 * Sources that don't publish Sofria themselves go through bibles' vendored
 * converter (source → USJ → Sofria), so no Sofria is hand-built anywhere in
 * the app:
 *   - helloAO chapter JSON (headings, poetry, footnotes, words of Jesus);
 *   - flat verse lists (DBT text_plain — the last-resort tier, no headings,
 *     poetry or notes): one paragraph, one verse marker per entry, labels
 *     kept as given ("2-3" for a DBT range).
 */
import { chapterToUsj, type Usj } from "./vendor/helloao/helloao_to_usj.mjs"
import { usjChapterToSofriaNative } from "./vendor/helloao/usj_to_sofria_native.mjs"
import type { SofriaDoc } from "./types"

/** `{lang, abbr}` for the Sofria metadata — any stable pair. */
export interface Translation {
  lang: string
  abbr: string
}

/** One helloAO chapter response (`/api/<tid>/<BOOK>/<ch>.json`) → Sofria. */
export function helloaoToSofria(chapterJson: unknown, book: string, translation: Translation): SofriaDoc {
  return usjChapterToSofriaNative(chapterToUsj(chapterJson, book), translation)
}

export interface FlatVerse {
  label: string
  text: string
}

export function flatVersesToUsj(book: string, chapter: number, verses: FlatVerse[]): Usj {
  const content: unknown[] = [
    { type: "book", marker: "id", code: book, content: [] },
    { type: "chapter", marker: "c", number: String(chapter) },
  ]
  const para: unknown[] = []
  for (const v of verses) {
    const text = v.text.trim()
    if (para.length) para.push(" ")
    para.push({ type: "verse", marker: "v", number: v.label })
    if (text) para.push(text)
  }
  if (para.length) content.push({ type: "para", marker: "p", content: para })
  return { type: "USJ", version: "3.0", content }
}

export function flatVersesToSofria(
  book: string,
  chapter: number,
  verses: FlatVerse[],
  translation: Translation,
): SofriaDoc {
  return usjChapterToSofriaNative(flatVersesToUsj(book, chapter, verses), translation)
}
