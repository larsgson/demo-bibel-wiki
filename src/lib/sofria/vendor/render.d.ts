// Types for the vendored render.js (ours, not upstream; not in VENDOR.json).
import type { SofriaDoc, SofriaContent } from "../types"

export interface CallerRule {
  type?: "default" | "abc" | "custom-symbol"
  symbol?: string
  noCallerToAuto?: boolean
}

export interface RenderOptions {
  notes?: "collected" | "inline"
  chapterNumber?: "drop-cap" | "top" | "none"
  direction?: "ltr" | "rtl" | string
  numerals?: string | ((n: string) => string) | null
  showVerseNumbers?: boolean
  hideVerseNumberOne?: boolean
  wordsOfJesus?: boolean
  glossaryLinks?: boolean
  introduction?: "inline" | "separate"
  remarks?: "hidden" | "shown"
  figureUrl?: ((src: string) => string | null) | null
  video?: ((id: string) => { title?: string; url?: string; thumbnailUrl?: string | null } | null) | null
  refLink?: ((referenceText: string) => string | null) | null
  idPrefix?: string
  callers?: { footnote?: CallerRule; xref?: CallerRule }
  showNotes?: boolean
  showImages?: boolean
  showVideos?: boolean
  verseLayout?: "paragraphs" | "one-per-line"
  verseRangeSeparator?: string
}

export interface RenderedNote {
  id: string
  kind: "footnote" | "xref" | string
  caller: string
  verse: string | null
  html: string
}

export interface RenderResult {
  html: string
  introduction: string
  notes: RenderedNote[]
  warnings: string[]
}

export function renderChapter(doc: SofriaDoc, options?: RenderOptions): RenderResult
export function plainText(items: SofriaContent[]): string
