import { splitReference, parseReference } from "./bible-utils"
import { loadChapterDoc } from "./chapter-doc"
import { renderChapterHtml, verseLabelIncludes, verseLabelOverlaps } from "../sofria"
import { excerptSofriaDoc } from "../sofria/excerpt"

/** Unique per rendered part: phrase/note ids must not repeat on a page that
 *  shows several excerpts. */
let partCount = 0

/**
 * A Bible-reader-IDENTICAL rendering of a story section's `[[ref:...]]`
 * passage — same renderer (bibles' render.js) Reader.svelte uses, so verse
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
 * would be confusing out of context; chapter number, note callers, figures,
 * videos, glossary links and red letters are left out — plain passage text
 * inside the story's own look. The HTML needs the shared SAB stylesheet and
 * sab-overlay.css (StorySection / ensureSabStyles).
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

    const { verses, verseStart = 0, verseEnd = Number.POSITIVE_INFINITY } = parsed
    const includeLabel = verses
      ? (label: string) => verses.some((n) => verseLabelIncludes(label, n))
      : (label: string) => verseLabelOverlaps(label, verseStart, verseEnd)
    const excerpt = excerptSofriaDoc(res.doc, includeLabel)
    if (excerpt.sequence.blocks?.length) {
      htmlParts.push(
        renderChapterHtml(excerpt, {
          idPrefix: `ref${++partCount}-`,
          chapterNumber: "none",
          hideVerseNumberOne: false,
          showNotes: false,
          showImages: false,
          showVideos: false,
          glossaryLinks: false,
          keywordLinks: false,
          wordsOfJesus: false,
        }).html,
      )
    }
  }

  return htmlParts.length > 0 ? htmlParts.join("") : null
}
