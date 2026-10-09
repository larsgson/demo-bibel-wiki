/**
 * Proskomma-side Sofria helpers, kept apart from ./index so that rendering
 * alone never pulls Proskomma into a bundle. Works on the app's own shared
 * SABProskomma instance (reader/store.ts) — PKF docSets and live-imported
 * DBT USX books both live there.
 */
import { sliceChapter, optionsFromAppConfig } from "./vendor/sources/pkf.js"
import type { RenderOptions } from "./vendor/render.js"
import type { SofriaDoc } from "./types"

/** The part of a Proskomma instance this module uses. */
export interface SofriaQueryable {
  gqlQuerySync(query: string): { data?: any } | undefined
}

const BOOK_CODE = /^[0-9A-Z]{3}$/

function querySofria(pk: SofriaQueryable, docSetId: string, book: string, chapter?: number): string | null {
  const arg = chapter == null ? "" : `(chapter: ${chapter})`
  const q = `{ docSet(id: "${docSetId}") { document(bookCode: "${book}") { sofria${arg} } } }`
  return pk.gqlQuerySync(q)?.data?.docSet?.document?.sofria ?? null
}

/**
 * One chapter of Sofria from a loaded docSet. proskomma-core's chapter-level
 * query fails on some real content (e.g. a table running across a chapter
 * break, ~10 chapters of `nca`); the whole-book query still works, so the
 * chapter is then cut out of that with the vendored `sliceChapter` and the
 * result is marked `fallback: 'whole-book'` — same rule as upstream's
 * `loadPkf().sofria()`.
 */
export function pkfChapterSofria(pk: SofriaQueryable, docSetId: string, book: string, chapter: number): SofriaDoc {
  if (!BOOK_CODE.test(book) || !Number.isInteger(chapter)) throw new Error(`bad reference ${book} ${chapter}`)
  let raw: string | null = null
  try {
    raw = querySofria(pk, docSetId, book, chapter)
  } catch {
    raw = null
  }
  if (raw) return JSON.parse(raw) as SofriaDoc

  const whole = querySofria(pk, docSetId, book)
  if (!whole) throw new Error(`No sofria for ${book} ${chapter}`)
  const doc = sliceChapter(JSON.parse(whole) as SofriaDoc, chapter)
  if (!doc.sequence.blocks?.length) throw new Error(`No sofria for ${book} ${chapter}`)
  doc.fallback = "whole-book"
  return doc
}

/** Renderer options from a PKF language's app-config.json (SAB's own
 *  settings: chapter-number style, red letters, caller symbols, numerals…).
 *  Empty for a language without one. */
export function pkfRenderOptions(appConfig: unknown): RenderOptions {
  if (!appConfig) return {}
  const { options, warnings } = optionsFromAppConfig(appConfig)
  if (warnings.length && typeof window !== "undefined" && window.location.search.includes("readerdebug")) {
    console.warn("[readerdebug/sofria] app-config:", warnings)
  }
  return options
}
