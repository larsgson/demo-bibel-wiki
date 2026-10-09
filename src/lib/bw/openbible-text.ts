import { pkfUrl } from "./pkf-url"
import type { SofriaDoc } from "../sofria/types"

/**
 * openbible (Biblica's Open Bible editions, published by bcv-commons/bibles
 * as per-chapter Sofria on the CDN). Everything a client needs comes from
 * one catalog, `catalog/openbible-editions.json`:
 *
 *   { entries: { <project id>: { abbr, iso, published,
 *                                books?, canon?, licenses?, path?, reason? } },
 *     formats: { sofria: { path: "<BOOK>/<chapter>.sofria.json" }, ... } }
 *
 * `canon`, `books`, `licenses` and `path` are present only when `published`;
 * an unpublished entry carries `reason` instead (e.g. "nd_license"). `path`
 * is the edition's CDN folder ("openbible/ekk/OECV/"). See bibles'
 * doc/openbible-chapters.md.
 *
 * Which editions this app actually offers is our own decision (licensing),
 * made in src/data/openbible-editions.json's allow-list — the catalog only
 * says what exists.
 */

export interface OpenbibleLicense {
  type: string
  url?: string
}

export interface OpenbibleEntry {
  abbr: string
  iso: string
  published: boolean
  books?: string[]
  /** "nt" | "ot", or "ntp" / "otp" for a partial testament. */
  canon?: string[]
  licenses?: OpenbibleLicense[]
  path?: string
  reason?: string
}

export interface OpenbibleCatalog {
  entries: Record<string, OpenbibleEntry>
  formats?: { sofria?: { path?: string } }
}

/** What chapter-doc.ts needs to fetch one openbible edition's chapters. */
export interface OpenbibleEdition {
  projectId: string
  abbr: string
  /** CDN folder, e.g. "openbible/ekk/OECV/". */
  path: string
  books: string[]
  licenses: OpenbibleLicense[]
  /** Chapter file pattern inside `path`, e.g. "<BOOK>/<chapter>.sofria.json". */
  sofriaPattern: string
}

const DEFAULT_SOFRIA_PATTERN = "<BOOK>/<chapter>.sofria.json"

let catalogPromise: Promise<OpenbibleCatalog | null> | null = null

/** bibles' openbible catalog, fetched once per session. */
export function loadOpenbibleCatalog(): Promise<OpenbibleCatalog | null> {
  if (catalogPromise) return catalogPromise
  catalogPromise = fetch(pkfUrl("/catalog/openbible-editions.json"))
    .then((r) => (r.ok ? (r.json() as Promise<OpenbibleCatalog>) : null))
    .catch(() => null)
  return catalogPromise
}

/**
 * The published editions for (iso, canon) that our allow-list enables, in
 * allow-list order. An allow-list item is "<iso>/<abbr>" or a project id.
 * Pure — the catalog is passed in.
 */
export function openbibleEditionsFor(
  catalog: OpenbibleCatalog | null,
  iso: string,
  canon: "nt" | "ot",
  allow: string[],
): OpenbibleEdition[] {
  if (!catalog?.entries || allow.length === 0) return []
  const sofriaPattern = catalog.formats?.sofria?.path ?? DEFAULT_SOFRIA_PATTERN
  const out: OpenbibleEdition[] = []
  for (const item of allow) {
    for (const [projectId, e] of Object.entries(catalog.entries)) {
      if (item !== projectId && item !== `${e.iso}/${e.abbr}`) continue
      if (e.iso !== iso || !e.published || !e.path || !e.books?.length) continue
      if (!e.canon?.some((c) => c === canon || c === `${canon}p`)) continue
      if (out.some((o) => o.projectId === projectId)) continue
      out.push({
        projectId,
        abbr: e.abbr,
        path: e.path,
        books: e.books,
        licenses: e.licenses ?? [],
        sofriaPattern,
      })
    }
  }
  return out
}

const chapterCache = new Map<string, Promise<SofriaDoc | null>>()

/** One chapter of an openbible edition as Sofria, or null when the edition
 *  doesn't have that book or the file isn't there. */
export function fetchOpenbibleChapter(edition: OpenbibleEdition, book: string, chapter: number): Promise<SofriaDoc | null> {
  if (!edition.books.includes(book)) return Promise.resolve(null)
  const file = edition.sofriaPattern.replace("<BOOK>", book).replace("<chapter>", String(chapter))
  const url = pkfUrl(`/${edition.path.replace(/^\/+/, "").replace(/\/?$/, "/")}${file}`)
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
export function isNDLicense(licenses: OpenbibleLicense[] | undefined | null): boolean {
  return !!licenses?.some((l) => /\bND\b/i.test(l.type))
}
