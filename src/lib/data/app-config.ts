/**
 * Runtime loaders for the new `cdn.bibel.wiki/pkf/` client-data contract.
 *
 * Two files, both consumed in the browser (the reader is a client island):
 *   - `<iso>/app-config.json` — per-language reader config (collection identity,
 *     localised book list, ~176 SAB feature flags, theme names, copyright).
 *   - `_app/nav-base.json`    — ONE shared English UI-strings set, fetched once
 *     and reused across every language (SAB-stable keys).
 *
 * Cache semantics (spec §2): both carry `max-age=300`, so the browser HTTP
 * cache revalidates every ~5 min. We add a thin in-memory layer here only to
 * dedupe concurrent/repeat calls within a session — never a hard override of
 * the HTTP cache.
 *
 * These apply to the PKF/vernacular reader path only. English (BSB) and Spanish
 * (DBT/helloao) come from separate pipelines and are not on this CDN.
 */

import { pkfUrl } from "../bw/pkf-url"

// ── Types (modelled on the live contract) ──────────────────────────────────

export interface Collection {
  id: string
  name: string
  abbreviation: string
  languageCode: string
  textDirection: "ltr" | "rtl"
}

export interface InterfaceLanguage {
  code: string
  displayName: string
  textDirection: "ltr" | "rtl"
}

export interface InterfaceLanguages {
  default: string
  available: InterfaceLanguage[]
}

export type Testament = "OT" | "NT"

export interface AppConfigBook {
  id: string // USFM code, e.g. "JHN"
  name: string // localised full name, e.g. "Yohanes"
  abbreviation: string // localised short name, e.g. "Yoh"
  testament: Testament
  section: string // e.g. "Pentateuch", "Gospels"
  chapters: number
}

export interface ThemeName {
  id: string // "Normal" | "Sepia" | "Dark" | …
  default?: boolean
}

export interface Copyright {
  license: string
  holder?: string
  source?: string
  /** Path (relative to the CDN's /pkf/ root, e.g. "ind/license-notice.html")
   *  to the full verbatim source attribution page for this language — added
   *  in the 2026.07.18 release. Present whenever the source deployment had
   *  one; hosted on our own CDN rather than the original (often
   *  private/staging) source. */
  notice_url?: string
}

/**
 * ~176 merged SAB feature flags. Only the ones the client acts on are typed;
 * unknown keys are forward-compatible (spec §6.3 — ignore unhandled flags).
 */
export interface Features {
  "start-at-reference"?: string // e.g. "JHN.1"
  "book-select"?: "grid" | "list" | (string & {})
  "book-group-titles"?: boolean
  "book-show-glossary"?: boolean
  search?: boolean
  "show-footnotes"?: boolean
  "show-cross-refs"?: boolean
  "app-layout-direction"?: "ltr" | "rtl"
  "ref-chapter-verse-separator"?: string
  "ref-verse-range-separator"?: string
  "ref-verse-list-separator"?: string
  "text-size-min"?: number
  "text-size-max"?: number
  [key: string]: unknown
}

export interface AppConfig {
  collection: Collection
  interfaceLanguages?: InterfaceLanguages
  features: Features
  books: AppConfigBook[]
  themeNames: ThemeName[]
  copyright?: Copyright
}

export type NavBase = Record<string, string>

// ── app-config.json (per language) ─────────────────────────────────────────

const appConfigCache = new Map<string, Promise<AppConfig | null>>()

export function loadAppConfig(iso: string): Promise<AppConfig | null> {
  const cached = appConfigCache.get(iso)
  if (cached) return cached
  const p = fetch(pkfUrl(`/pkf/${iso}/app-config.json`))
    .then((r) => (r.ok ? (r.json() as Promise<AppConfig>) : null))
    .catch(() => null)
  appConfigCache.set(iso, p)
  return p
}

// ── _app/nav-base.json (shared English strings, fetched once) ───────────────

let navBasePromise: Promise<NavBase> | null = null

export function loadNavBase(): Promise<NavBase> {
  if (navBasePromise) return navBasePromise
  navBasePromise = fetch(pkfUrl(`/pkf/_app/nav-base.json`))
    .then((r) => (r.ok ? (r.json() as Promise<NavBase>) : {}))
    .catch(() => ({}))
  return navBasePromise
}

/** Look up a SAB nav string by key, with an optional fallback. */
export function navLabel(navBase: NavBase | null, key: string, fallback = ""): string {
  return navBase?.[key] ?? fallback
}

// ── Derived helpers ─────────────────────────────────────────────────────────

/** The default theme id from `themeNames` (falls back to "Normal"). */
export function defaultTheme(cfg: AppConfig | null): string {
  const named = cfg?.themeNames?.find((t) => t.default) ?? cfg?.themeNames?.[0]
  return named?.id ?? "Normal"
}

/**
 * Group books by canonical section, preserving the array order given by the
 * contract (spec §6.4: "Array order is canonical"). Returns sections in first-
 * seen order, each with its books in-order.
 */
export function booksBySection(
  books: AppConfigBook[],
): { section: string; testament: Testament; books: AppConfigBook[] }[] {
  const out: { section: string; testament: Testament; books: AppConfigBook[] }[] = []
  const index = new Map<string, number>()
  for (const b of books) {
    let i = index.get(b.section)
    if (i === undefined) {
      i = out.length
      index.set(b.section, i)
      out.push({ section: b.section, testament: b.testament, books: [] })
    }
    out[i].books.push(b)
  }
  return out
}

/** Parse a `start-at-reference` like "JHN.1" (or "JHN.1.1") into book + chapter. */
export function parseStartRef(
  ref: string | undefined,
): { book: string; chapter: number } | null {
  if (!ref) return null
  const [book, ch] = ref.split(".")
  if (!book) return null
  const chapter = ch ? parseInt(ch, 10) : 1
  return { book, chapter: Number.isFinite(chapter) ? chapter : 1 }
}
