/**
 * Parsing for bcv-commons/bibles' canonical language-name catalog
 * (`https://cdn.bibel.wiki/dbt/_app/language-names.json`, doc/language-
 * names.md) — a single iso -> {name, vernacular} lookup covering every
 * language their catalog knows about from any source (DBT, PKF, OBS).
 *
 * This app used to maintain its own multi-tier local fallback (a curated
 * list, then ALL-langs-compact.json, then a live PKF-manifest merge) to
 * paper over exactly the gaps this file already closes — that logic is
 * gone as of 2026-09-15, replaced everywhere by reading this one file.
 * (Real trigger: a PKF-only language, "ivv"/Ivatan, had a real name in
 * PKF's own manifest that our old logic hadn't been taught to check,
 * silently showing the raw ISO code instead — reported upstream, and
 * bibles published this file specifically so clients stop needing to
 * maintain that kind of layering themselves.)
 *
 * Single point for reading this file's shape — used by languageNames.ts
 * (a local build-time snapshot; see scripts/fetch-data.mjs), language-
 * store.ts ($languageNames, live client fetch), and language-list.ts
 * (the picker list, live client fetch).
 */

export interface LanguageNameCatalog {
  schema_version: number
  generated_at: string
  count: number
  l: Record<string, string | [string, string]>
}

export interface ResolvedName {
  n: string
  v: string
}

/** `l[iso]` is a bare string (name only — no distinct vernacular known, or
 *  it's identical to the name) or a `[name, vernacular]` pair. */
export function resolveNameRow(row: string | [string, string] | undefined): ResolvedName | undefined {
  if (!row) return undefined
  if (typeof row === "string") return { n: row, v: row }
  return { n: row[0], v: row[1] || row[0] }
}

export function nameFromCatalog(
  catalog: LanguageNameCatalog | null | undefined,
  iso: string,
): ResolvedName | undefined {
  return resolveNameRow(catalog?.l?.[iso])
}

/**
 * Generic "check these sources in order, return the first entry with
 * usable content" lookup — for callers that need more than just a name
 * from a source (e.g. languageNames.ts's `.d`/`.s` script/direction
 * fields, which bibles' canonical catalog above doesn't carry at all, so
 * that lookup still needs its own older, richer per-entry sources).
 */
export function firstNamedEntry<T extends { n?: string; v?: string }>(
  iso: string,
  sources: Array<Record<string, T> | undefined | null>,
): T | undefined {
  for (const src of sources) {
    const e = src?.[iso]
    if (e?.n || e?.v) return e
  }
  return undefined
}
