/**
 * Prune a Sofria chapter down to the verses a story section references, so
 * the excerpt renders through the same renderer as the Bible reader (verse
 * numbers, paragraph/poetry structure, headings) — see bw/reference-html.ts.
 *
 * Follows the verse in force while walking the chapter in reading order: a
 * `verses_label` mark (or a `verses` wrapper's number) sets it, and it
 * carries across paragraphs, so a verse continued in a later paragraph is
 * kept too. Content is kept while the verse in force passes `includeLabel`
 * (given the source's own label: "3", "2-3", "17b"). Works on docs with and
 * without `verses`/`chapter` wrappers; a wrapper or paragraph left with
 * nothing is dropped. Chapter numbers are dropped (an excerpt shows none).
 *
 * Top-level grafts: only headings immediately before a kept paragraph are
 * kept (they introduce that passage); titles, introductions and headings
 * whose passage falls outside the excerpt are dropped.
 */
import type { SofriaBlock, SofriaContent, SofriaDoc } from "./types"

const one = (v: unknown): string => String(Array.isArray(v) ? v[0] : (v ?? ""))

export function excerptSofriaDoc(doc: SofriaDoc, includeLabel: (label: string) => boolean): SofriaDoc {
  let current: string | null = null
  const keeping = () => current !== null && includeLabel(current)

  function filter(items: SofriaContent[]): SofriaContent[] {
    const kept: SofriaContent[] = []
    for (const it of items) {
      if (typeof it === "object" && it.type === "wrapper") {
        if (it.subtype === "verses" && it.atts?.number != null) current = one(it.atts.number)
        const inner = filter(it.content ?? [])
        if (inner.length) kept.push({ ...it, content: inner })
        continue
      }
      if (typeof it === "object" && it.type === "mark") {
        if (it.subtype === "chapter_label") continue
        if (it.subtype === "verses_label") current = one(it.atts?.number)
      }
      if (keeping()) kept.push(it)
    }
    return kept
  }

  const out: SofriaBlock[] = []
  let headings: SofriaBlock[] = []
  for (const block of doc.sequence.blocks ?? []) {
    if (block.type === "graft") {
      if ((block.subtype ?? block.sequence?.type) === "heading") headings.push(block)
      continue
    }
    const content = filter(block.content ?? [])
    if (content.length) out.push(...headings, { ...block, content })
    headings = []
  }
  return { ...doc, sequence: { ...doc.sequence, blocks: out } }
}
