/**
 * Sofria — Proskomma's chapter JSON, the one structure every scripture
 * source in this app is turned into (PKF natively, DBT text_json / text_usx,
 * openbible, helloAO via the vendored converter). Shape summary (what this
 * app touches directly; the vendored renderer/extractor handle the rest):
 *
 *   { sequence: { type, blocks: [Block] } }
 *
 *   Block     = Paragraph | Graft
 *   Paragraph = { type: "paragraph", subtype: "usfm:p" | "usfm:q1" | ..., content: [Content] }
 *   Graft     = { type: "graft", sequence: InnerSeq }
 *             -- top-level grafts (title/heading/remark) carry NO `subtype`
 *                of their own; the type lives on `sequence.type`. Inline
 *                grafts (footnote/xref) DO set `subtype`.
 *
 *   Content   = string
 *             | { type: "mark",    subtype: "verses_label" | "chapter_label", atts: { number } }
 *             | { type: "wrapper", subtype: "chapter" | "verses" | "usfm:wj" | ..., content: [Content] }
 *             | { type: "graft",   subtype: "footnote" | "xref" | "note_caller", sequence: InnerSeq }
 *             | { type: "start_milestone" | "end_milestone", subtype: "usfm:zvideo" | ..., atts }
 *
 *   InnerSeq  = { type, blocks: [Block] }   -- recursive
 */

export type SofriaAtts = Record<string, string | string[]>

export type SofriaDoc = {
  sequence: SofriaSeq
  /** Set by the whole-book fallback (see pkf.ts / vendored sliceChapter). */
  fallback?: string
  [key: string]: unknown
}

export type SofriaSeq = {
  type: string
  blocks?: SofriaBlock[]
}

export type SofriaParagraph = { type: "paragraph"; subtype?: string; content: SofriaContent[] }
export type SofriaGraft = { type: "graft"; subtype?: string; sequence: SofriaSeq }

export type SofriaBlock = SofriaParagraph | SofriaGraft

export type SofriaMark = { type: "mark"; subtype?: string; atts?: Record<string, string> }
export type SofriaWrapper = {
  type: "wrapper"
  subtype?: string
  content?: SofriaContent[]
  atts?: SofriaAtts
}
export type SofriaMilestone = {
  type: "start_milestone" | "end_milestone"
  subtype?: string
  atts?: SofriaAtts
}

export type SofriaContent = string | SofriaMark | SofriaWrapper | SofriaGraft | SofriaMilestone
