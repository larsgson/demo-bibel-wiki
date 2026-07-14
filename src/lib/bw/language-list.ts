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
 * ALL-langs catalog). For those, we fall back to the uppercased ISO code as the
 * display name until a proper 639-3 reference name is wired in.
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
  /** Has audio in any canon, per the live CDN media-index (/dbt/_app/media-index.json). */
  audio?: boolean
  /** Has verse-synced audio in any canon, per the same index. */
  timing?: boolean
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
let localPkfPromise: Promise<Set<string>> | null = null
function loadLocalPkfSet(): Promise<Set<string>> {
  if (localPkfPromise) return localPkfPromise
  localPkfPromise = (async () => {
    try {
      const resp = await fetch(pkfUrl("/pkf/manifest.json"))
      if (!resp.ok) return new Set<string>()
      const m = await resp.json()
      return new Set<string>((m.languages ?? []).map((l: any) => l.iso))
    } catch {
      return new Set<string>()
    }
  })()
  return localPkfPromise
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

  // 3. Live CDN media index (/dbt/_app/media-index.json) → real audio/timing
  // availability per language, independent of (and often broader than) the
  // .pkf list — many .pkf languages have no CDN media, and many non-.pkf
  // languages do have audio via the /dbt tree.
  try {
    const media = await loadMediaIndex()
    for (const [iso, avail] of media) {
      const entry = byIso.get(iso)
      const audio = !!(avail.nt?.audio || avail.ot?.audio)
      const timing = !!(avail.nt?.timing || avail.ot?.timing)
      if (entry) {
        entry.audio = audio
        entry.timing = timing
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
