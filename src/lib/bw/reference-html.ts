import { splitReference, parseReference } from "./bible-utils"
import { loadChapterDoc } from "./chapter-doc"
import { excerptSofriaDoc, verseRangeIncludes } from "../reader/sofriaExcerpt"
import { renderSofria } from "../reader/sofria"

/**
 * A Bible-reader-IDENTICAL rendering of a story section's `[[ref:...]]`
 * passage — same renderSofria pipeline Reader.svelte uses, so verse
 * numbers, paragraph/poetry structure and headings all render exactly as
 * they do in the main reader, instead of the flattened one-line string
 * getTextForReference/extractVerses (markdown-parser.ts) produces. Used
 * by StoryReaderIsland to give image-less, reference-only sections the
 * same look as navigating the passage directly.
 *
 * A reference can be a comma-separated list spanning multiple ranges (and
 * in principle multiple chapters/books) — each part is fetched and
 * excerpted independently, then its HTML concatenated in order. Verse
 * numbers are always shown (hideVerseNumberOne=false) regardless of any
 * app-level config, since a verse-1-only excerpt with no number at all
 * would be confusing out of context.
 *
 * Returns null when nothing resolves (no candidate edition, chapter not
 * found, or a malformed reference) — callers should fall back to the
 * existing flattened-text rendering in that case, same as before this
 * existed.
 */
export async function loadReferenceHtml(iso: string, reference: string): Promise<string | null> {
  const parts = splitReference(reference)
  if (parts.length === 0) return null

  const htmlParts: string[] = []
  for (const part of parts) {
    const parsed = parseReference(part)
    if (!parsed) continue
    const res = await loadChapterDoc(iso, parsed.book, parsed.chapter)
    if (!res) continue

    const includeVerse = parsed.verses
      ? (n: number) => parsed.verses!.includes(n)
      : verseRangeIncludes(parsed.verseStart, parsed.verseEnd)
    const excerpt = excerptSofriaDoc(res.doc, includeVerse)
    if (excerpt.sequence.blocks?.length) {
      htmlParts.push(renderSofria(excerpt, {}, "hide", [], false).html)
    }
  }

  return htmlParts.length > 0 ? htmlParts.join("") : null
}
