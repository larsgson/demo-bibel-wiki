import { pkfUrl } from "./pkf-url"
import type { SofriaDoc } from "../sofria/types"

/**
 * Editions bcv-commons/bibles publishes itself on the CDN as per-chapter
 * Sofria — openbible (Biblica), audiobiblia, eBible, CrossWire, Door43
 * (source ids `o:`, `e:`, `c:`, `g:`). text-route.json gives each one's
 * folder (`path`, e.g. "door43/spa/es-419_glt/"); the folder's `_meta.json`
 * gives its name, books, licences and file layout:
 *
 *   { name, licenses: [{type, url}], books: [...],
 *     formats: { sofria: { path: "<BOOK>/<chapter>.sofria.json" }, ... } }
 *
 * See bibles' doc/client-chapter-formats.md and doc/openbible-chapters.md.
 */

export interface PublishedLicense {
  type: string
  url?: string
}

export interface PublishedMeta {
  name?: string
  books?: string[]
  licenses?: PublishedLicense[]
  formats?: { sofria?: { path?: string } }
}

const DEFAULT_SOFRIA_PATTERN = "<BOOK>/<chapter>.sofria.json"

/** "door43/spa/es-419_glt" → "door43/spa/es-419_glt/" (no leading slash). */
export function editionFolder(path: string): string {
  return path.replace(/^\/+/, "").replace(/\/?$/, "/")
}

/** The chapter file of an edition, relative to the CDN root. */
export function publishedChapterPath(path: string, meta: PublishedMeta, book: string, chapter: number): string {
  const pattern = meta.formats?.sofria?.path ?? DEFAULT_SOFRIA_PATTERN
  return editionFolder(path) + pattern.replace("<BOOK>", book).replace("<chapter>", String(chapter))
}

const metaCache = new Map<string, Promise<PublishedMeta | null>>()

/** An edition folder's `_meta.json`, cached per session. */
export function loadPublishedMeta(path: string): Promise<PublishedMeta | null> {
  const folder = editionFolder(path)
  const cached = metaCache.get(folder)
  if (cached) return cached
  const p = fetch(pkfUrl(`/${folder}_meta.json`))
    .then((r) => (r.ok ? (r.json() as Promise<PublishedMeta>) : null))
    .catch(() => null)
  metaCache.set(folder, p)
  return p
}

const chapterCache = new Map<string, Promise<SofriaDoc | null>>()

/** One chapter of a published edition as Sofria, or null when the edition
 *  doesn't have that book or the file isn't there. */
export async function fetchPublishedChapter(path: string, book: string, chapter: number): Promise<SofriaDoc | null> {
  const meta = await loadPublishedMeta(path)
  if (!meta?.books?.includes(book)) return null
  const url = pkfUrl(`/${publishedChapterPath(path, meta, book, chapter)}`)
  const cached = chapterCache.get(url)
  if (cached) return cached
  const p = fetch(url)
    .then((r) => (r.ok ? (r.json() as Promise<SofriaDoc>) : null))
    .then((doc) => (doc?.sequence ? doc : null))
    .catch(() => null)
  chapterCache.set(url, p)
  return p
}

/**
 * ND (No-Derivatives) detection, per edition. ND editions are not excluded
 * here — show them, just label the license clearly wherever this returns
 * true (explicit instruction, 2026-09-16).
 */
export function isNDLicense(licenses: PublishedLicense[] | undefined | null): boolean {
  return !!licenses?.some((l) => /\bND\b/i.test(l.type))
}
