/**
 * The app's one entry point to scripture rendering and text extraction.
 * Everything goes through bcv-commons/bibles' reference Sofria renderer and
 * extractor, vendored unmodified under ./vendor (see VENDOR.json and
 * scripts/sync-sofria-render.mjs) — this module only sets the app's defaults
 * and adapts the results. PKF-specific helpers (Proskomma queries, the
 * app-config → options mapping) live in ./pkf so that importing this module
 * never pulls Proskomma into a bundle.
 *
 * See internal-docs/sofria-rendering-migration.md.
 */
import { renderChapter, type RenderOptions, type RenderResult } from "./vendor/render.js"
import { extractEntries, verseList } from "./vendor/verses.js"
import { parseVerseLabel, verseLabelStart } from "./verse-label"
import type { SofriaBlock, SofriaContent, SofriaDoc, SofriaMilestone, SofriaParagraph } from "./types"

export type { RenderOptions, RenderResult, RenderedNote } from "./vendor/render.js"
export type { SofriaEntry } from "./vendor/verses.js"
export * from "./types"
export * from "./verse-label"

/** App-wide renderer defaults: notes come back as a list (shown in our
 *  popover, never inline), introductions separately (shown collapsed). */
const APP_DEFAULTS: RenderOptions = {
  notes: "collected",
  introduction: "separate",
}

function readerDebug(): boolean {
  return typeof window !== "undefined" && window.location.search.includes("readerdebug")
}

/** Render one Sofria chapter to SAB-DOM HTML. `options` are layered over the
 *  app defaults — callers pass PKF app-config options (see pkf.ts
 *  `pkfRenderOptions`) followed by their own overrides. */
export function renderChapterHtml(doc: SofriaDoc, options: RenderOptions = {}): RenderResult {
  const result = renderChapter(doc, { ...APP_DEFAULTS, ...options })
  if (result.warnings.length && readerDebug()) {
    console.warn("[readerdebug/sofria] renderer warnings:", result.warnings)
  }
  return result
}

/** One verse of plain text. `label` is the source's own verse label ("3",
 *  "2-3", "17b"); `num` is the first verse it covers, for integer lookups
 *  (null only for a label that is not a verse number at all). */
export interface ChapterVerse {
  label: string
  num: number | null
  text: string
}

/** A chapter's verses in reading order, headings/notes/intro excluded — the
 *  text every non-HTML consumer uses (story verse text, parallel view,
 *  search, audio sync). */
export function chapterVerses(doc: SofriaDoc): ChapterVerse[] {
  return verseList(extractEntries(doc)).map((v) => ({
    label: v.verse,
    num: verseLabelStart(v.verse),
    text: v.text,
  }))
}

/** A video placed at a verse (from a PKF language's media manifest). */
export interface PlacementVideo {
  id: string
  placement?: { verse?: number | null; pos?: string | null } | null
}

function zvideo(id: string): SofriaMilestone {
  return { type: "start_milestone", subtype: "usfm:zvideo", atts: { id: [id] } }
}

const isParagraph = (b: SofriaBlock | undefined): b is SofriaParagraph => b?.type === "paragraph"

/** Visit every verses_label mark in a paragraph, in order (wrappers included). */
function forEachVerseLabel(items: SofriaContent[] | undefined, fn: (label: string) => void) {
  for (const it of items ?? []) {
    if (typeof it !== "object" || !it) continue
    if (it.type === "mark" && it.subtype === "verses_label") fn(String(it.atts?.number ?? ""))
    else if (it.type === "wrapper") forEachVerseLabel(it.content, fn)
  }
}

/**
 * Place verse-anchored videos as the renderer's own `\zvideo` milestones, so
 * they come out as `div.video-block[data-video-id]` between paragraphs (the
 * renderer emits a milestone's video after the paragraph that holds it):
 *   - 'after' (the default): after the paragraph containing the verse;
 *   - 'before', when the verse opens its paragraph: just before that paragraph
 *     (after any heading above it); 'before' a verse in mid-paragraph falls
 *     back to after the paragraph — a block can't split a paragraph.
 * Videos whose verse isn't in this chapter are left out. Returns a new doc;
 * the input is not modified.
 */
export function injectPlacementVideos(doc: SofriaDoc, videos: PlacementVideo[] | undefined): SofriaDoc {
  const placed = (videos ?? []).filter((v) => v.placement?.verse != null)
  if (!placed.length) return doc

  const blocks = doc.sequence.blocks ?? []
  const paraOf = new Map<number, number>() // verse -> index of the paragraph where it starts
  const opensPara = new Set<number>() // verses whose label is the first one in their paragraph
  blocks.forEach((b, i) => {
    if (!isParagraph(b)) return
    let first = true
    forEachVerseLabel(b.content, (label) => {
      const r = parseVerseLabel(label)
      if (r) {
        for (let v = r.start; v <= r.end; v++) {
          if (paraOf.has(v)) continue
          paraOf.set(v, i)
          if (first) opensPara.add(v)
        }
      }
      first = false
    })
  })

  const append = new Map<number, SofriaMilestone[]>() // paragraph index -> milestones at its end
  const insertBefore = new Map<number, SofriaMilestone[]>() // block index -> standalone paragraph before it
  const add = (m: Map<number, SofriaMilestone[]>, i: number, id: string) => m.set(i, [...(m.get(i) ?? []), zvideo(id)])
  for (const v of placed) {
    const verse = v.placement!.verse!
    const i = paraOf.get(verse)
    if (i === undefined) continue
    if (v.placement?.pos === "before" && opensPara.has(verse)) {
      if (isParagraph(blocks[i - 1])) add(append, i - 1, v.id)
      else add(insertBefore, i, v.id)
    } else add(append, i, v.id)
  }

  const out: SofriaBlock[] = []
  blocks.forEach((b, i) => {
    const before = insertBefore.get(i)
    if (before) out.push({ type: "paragraph", subtype: "usfm:b", content: before })
    const extra = append.get(i)
    out.push(extra && isParagraph(b) ? { ...b, content: [...b.content, ...extra] } : b)
  })
  return { ...doc, sequence: { ...doc.sequence, blocks: out } }
}
