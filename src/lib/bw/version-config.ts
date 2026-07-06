/**
 * Bible version resolution.
 *
 * A "version" bundles up to three independently-sourced channels — text, audio,
 * and timing — under a short slug scoped to a language (e.g. `ind/tsi`). The
 * catalog lives in `config/bible-sources.json`; it is intentionally sparse:
 * only languages that need something other than the implicit default appear
 * there. Everything else resolves by fallback.
 *
 * Resolution order (highest wins):
 *   1. explicit `selected` (e.g. a URL param)
 *   2. persisted user choice   (localStorage `bw-version:<iso>`)   ← beats region
 *   3. region override         (slug the caller read from the region TOML)
 *   4. global default          (none yet — reserved for config/bible-defaults.json)
 *   5. fallback                (first slug defined for the language)
 *   6. implicit                (text = pkf; audio/timing = pkf if the CDN has them)
 */

import sourcesData from "../../../config/bible-sources.json"

export type TextProvider = "pkf" | "helloao" | "bsb"
export type AudioProvider = "dbt" | "pkf"
export type TimingProvider = "bundled" | "pkf"

export interface TextSource {
  provider: TextProvider
  /** helloao translation id (e.g. "ind_ayt"). */
  id?: string
  /** pkf collection id for multi-collection languages (e.g. "C01"). */
  collection?: string
}

export interface AudioSource {
  provider: AudioProvider
  /** DBT/Bible Brain fileset id (e.g. "INZTSIN1DA"). */
  fileset?: string
}

export interface TimingSource {
  provider: TimingProvider
  /** ALL-timings text fileset folder (e.g. "INDTSI"). */
  textFileset?: string
  /** ALL-timings audio fileset key (e.g. "INZTSIN1DA"). */
  audioFileset?: string
}

export interface VersionSource {
  label?: Record<string, string>
  shortName?: string
  text: TextSource
  audio?: AudioSource
  timing?: TimingSource
}

export interface ResolvedVersion {
  /** The chosen slug, or null when resolved implicitly (no catalog entry). */
  slug: string | null
  label: Record<string, string>
  shortName?: string
  text: TextSource
  audio: AudioSource | null
  timing: TimingSource | null
}

type Catalog = Record<string, Record<string, VersionSource>>

const SOURCES: Catalog = (sourcesData as { sources?: Catalog }).sources ?? {}

/** The implicit default for languages with no catalog entry: pkf everywhere. */
const IMPLICIT: ResolvedVersion = {
  slug: null,
  label: {},
  text: { provider: "pkf" },
  audio: { provider: "pkf" },
  timing: { provider: "pkf" },
}

function userKey(iso: string): string {
  return `bw-version:${iso}`
}

/** The user's persisted version choice for a language, if any. */
export function getUserVersion(iso: string): string | null {
  if (typeof localStorage === "undefined") return null
  try {
    return localStorage.getItem(userKey(iso))
  } catch {
    return null
  }
}

/** Persist (or clear, with slug === null) the user's version choice. */
export function setUserVersion(iso: string, slug: string | null): void {
  if (typeof localStorage === "undefined") return
  try {
    if (slug) localStorage.setItem(userKey(iso), slug)
    else localStorage.removeItem(userKey(iso))
  } catch {
    /* private mode / quota — ignore */
  }
}

/** All versions defined for a language (the future picker's option list). */
export function versionsFor(iso: string): Array<{ slug: string } & VersionSource> {
  const langSlugs = SOURCES[iso]
  if (!langSlugs) return []
  return Object.entries(langSlugs).map(([slug, v]) => ({ slug, ...v }))
}

/**
 * Resolve the version to use for a language. See the file header for the
 * precedence order. `region` is the slug the caller read from the region
 * config for this language (not the region name).
 */
export function resolveVersion(
  iso: string,
  opts: { selected?: string | null; region?: string | null } = {},
): ResolvedVersion {
  const langSlugs = SOURCES[iso]

  const candidates = [
    opts.selected ?? null,
    getUserVersion(iso),
    opts.region ?? null,
    // 4. global default — reserved (config/bible-defaults.json), none yet
  ]

  let slug: string | null = null
  for (const c of candidates) {
    if (c && langSlugs?.[c]) { slug = c; break }
  }

  // 5. fallback: first slug defined for the language
  if (!slug && langSlugs) {
    const first = Object.keys(langSlugs)[0]
    if (first) slug = first
  }

  // 6. implicit: no catalog entry at all
  if (!slug || !langSlugs?.[slug]) return IMPLICIT

  const v = langSlugs[slug]
  return {
    slug,
    label: v.label ?? {},
    shortName: v.shortName,
    text: v.text,
    audio: v.audio ?? null,
    timing: v.timing ?? null,
  }
}
