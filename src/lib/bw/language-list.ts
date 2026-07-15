/**
 * Merged language list for the picker.
 *
 * Master list = union of:
 *   - bibel-wiki's ALL-langs catalog (/ALL-langs-compact.json, ~2137 languages,
 *     with English name + vernacular endonym + category)
 *   - the .pkf list (config/pkf-langs.json, 588 languages with full offline text
 *     + audio — the priority tier)
 *
 * The union is longer than either source (39 .pkf languages are not in the
 * ALL-langs catalog). For those, the live PKF manifest's own `nm`/`v` fields
 * (§3 of the CDN client-data spec) supply the display name — an ISO-uppercase
 * fallback is used only if even the manifest lacks the language.
 */

import pkfLangs from "../../../config/pkf-langs.json"
import { isStudyLanguage } from "./study-languages"
import { pkfUrl } from "./pkf-url"
import { loadMediaIndex } from "./dbt-media"

export interface PickerLanguage {
  iso: string
  /** English exonym, e.g. "Spanish" */
  name: string
  /** Native endonym, e.g. "Español" */
  vernacular: string
  /** Has .pkf full offline text + audio — the priority tier */
  pkf: boolean
  /** Study-capable (bcv-query backend supports study content) */
  study: boolean
  /** Source category from ALL-langs (e.g. "with-timecode"), if known */
  category?: string
  /** Has audio in any canon — OR of the DBT media-index (/dbt/_app/media-index.json)
   *  and the PKF manifest's own Scripture-Earth-sourced `media` flags. */
  audio?: boolean
  /** Has verse-synced audio in any canon, same sources as `audio`. */
  timing?: boolean
  /** Testament coverage from the PKF manifest's `codex` field ("o"/"n"/"d"
   *  letters, e.g. "on" = full Bible, "n" = NT only), when known. */
  codex?: string
}

interface PkfManifestEntry {
  nm: string
  v?: string
  media: string
  codex: string
}

let pkfManifestPromise: Promise<Map<string, PkfManifestEntry>> | null = null

/** Live `/pkf/manifest.json`, normalized to an iso→entry map. Cached for the
 *  session. Backs both `loadLocalPkfSet()` (dev on-disk probing) and the
 *  picker enrichment step below (names + Scripture-Earth media/codex flags). */
function loadPkfManifest(): Promise<Map<string, PkfManifestEntry>> {
  if (pkfManifestPromise) return pkfManifestPromise
  pkfManifestPromise = (async () => {
    try {
      const resp = await fetch(pkfUrl("/pkf/manifest.json"))
      if (!resp.ok) return new Map<string, PkfManifestEntry>()
      const m = await resp.json()
      const langs = m.languages
      // manifest.json's `languages` has been both an array of {iso, ...} and
      // a dict keyed by iso (current CDN shape) — handle either.
      const entries: [string, any][] = Array.isArray(langs)
        ? langs.map((l: any) => [l.iso, l])
        : Object.entries(langs ?? {})
      return new Map<string, PkfManifestEntry>(
        entries.map(([iso, e]) => [
          iso,
          { nm: e?.nm ?? iso.toUpperCase(), v: e?.v, media: e?.media ?? "", codex: e?.codex ?? "" },
        ]),
      )
    } catch {
      return new Map<string, PkfManifestEntry>()
    }
  })()
  return pkfManifestPromise
}

const PKF_SET = new Set<string>((pkfLangs as { isos: string[] }).isos)

/** The .pkf ISO set (priority tier) — exported for badges/filters. */
export function pkfIsos(): Set<string> {
  return PKF_SET
}

/** Does this language have .pkf data (per the committed full list)? Use for
 *  badges/filters. For deciding whether to actually probe on disk, prefer
 *  shouldProbePkf() which also accounts for what's present locally in dev. */
export function hasPkf(iso: string): boolean {
  return PKF_SET.has(iso)
}

// Dev-only: which .pkf languages are actually present on disk. In production all
// 588 are deployed, so we trust the committed list; in dev only a subset may be
// fetched, so we gate probes on the local manifest to avoid 404 noise.
function loadLocalPkfSet(): Promise<Set<string>> {
  return loadPkfManifest().then((m) => new Set(m.keys()))
}

/** Should we probe /pkf/{iso}/info.json for this language? In production, true
 *  for any .pkf language; in dev, only when the data is actually on disk. */
export async function shouldProbePkf(iso: string): Promise<boolean> {
  if (!PKF_SET.has(iso)) return false
  if (!import.meta.env.DEV) return true
  return (await loadLocalPkfSet()).has(iso)
}

let cache: PickerLanguage[] | null = null

/**
 * Build the merged, enriched language list. Loads the ALL-langs catalog at
 * runtime and unions it with the static .pkf list. Cached after first call.
 */
export async function buildPickerLanguages(): Promise<PickerLanguage[]> {
  if (cache) return cache

  const byIso = new Map<string, PickerLanguage>()

  // 1. ALL-langs catalog → names, vernaculars, categories
  try {
    const resp = await fetch("/ALL-langs-compact.json")
    const data = await resp.json()
    if (data.canons) {
      for (const categories of Object.values(data.canons) as any[]) {
        for (const [catName, langs] of Object.entries(categories) as any[]) {
          for (const [iso, info] of Object.entries(langs) as any[]) {
            if (!info?.n || byIso.has(iso)) continue
            byIso.set(iso, {
              iso,
              name: info.n,
              vernacular: info.v || info.n,
              pkf: PKF_SET.has(iso),
              study: isStudyLanguage(iso),
              category: catName,
            })
          }
        }
      }
    }
  } catch (e) {
    console.warn("Failed to load ALL-langs catalog:", e)
  }

  // 2. .pkf languages not in the catalog (the ~39) → add with ISO fallback name
  for (const iso of PKF_SET) {
    if (byIso.has(iso)) continue
    byIso.set(iso, {
      iso,
      name: iso.toUpperCase(),
      vernacular: iso.toUpperCase(),
      pkf: true,
      study: isStudyLanguage(iso),
    })
  }

  // 3. Live PKF manifest (/pkf/manifest.json) → authoritative names for .pkf
  // languages missing from ALL-langs (replaces the ISO-uppercase fallback from
  // step 2), plus Scripture-Earth's own media/codex flags. `media` here is
  // SE-scope only (spec §3) — OR'd with the DBT index in step 4 below for the
  // full picture, never overwritten.
  try {
    const pkfManifest = await loadPkfManifest()
    for (const [iso, e] of pkfManifest) {
      const seAudio = e.media.includes("a")
      const seTiming = e.media.includes("t")
      const entry = byIso.get(iso)
      if (entry) {
        if (entry.name === iso.toUpperCase()) entry.name = e.nm
        if (entry.vernacular === iso.toUpperCase()) entry.vernacular = e.v || e.nm
        entry.audio = !!(entry.audio || seAudio)
        entry.timing = !!(entry.timing || seTiming)
        entry.codex = e.codex || entry.codex
      } else {
        byIso.set(iso, {
          iso,
          name: e.nm,
          vernacular: e.v || e.nm,
          pkf: true,
          study: isStudyLanguage(iso),
          audio: seAudio,
          timing: seTiming,
          codex: e.codex,
        })
      }
    }
  } catch (e) {
    console.warn("Failed to load PKF manifest for picker enrichment:", e)
  }

  // 4. Live CDN media index (/dbt/_app/media-index.json) → DBT/Bible Brain
  // audio/timing availability per language, independent of (and often
  // broader than) the .pkf list. OR'd with whatever step 3 already found —
  // a language can have SE audio, DBT audio, or both.
  try {
    const media = await loadMediaIndex()
    for (const [iso, avail] of media) {
      const entry = byIso.get(iso)
      const audio = !!(avail.nt?.audio || avail.ot?.audio)
      const timing = !!(avail.nt?.timing || avail.ot?.timing)
      if (entry) {
        entry.audio = !!(entry.audio || audio)
        entry.timing = !!(entry.timing || timing)
      } else {
        byIso.set(iso, {
          iso,
          name: avail.name,
          vernacular: avail.vernacular || avail.name,
          pkf: PKF_SET.has(iso),
          study: isStudyLanguage(iso),
          audio,
          timing,
        })
      }
    }
  } catch (e) {
    console.warn("Failed to load CDN media index:", e)
  }

  cache = [...byIso.values()].sort((a, b) => a.name.localeCompare(b.name))
  return cache
}
