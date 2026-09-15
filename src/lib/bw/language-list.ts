/**
 * Merged language list for the picker.
 *
 * Master list = union of:
 *   - bibel-wiki's ALL-langs catalog (/ALL-langs-compact.json, ~2137 languages,
 *     source category + testament/timing detail)
 *   - the .pkf list (config/pkf-langs.json, 588 languages with full offline text
 *     + audio — the priority tier), enriched with Scripture-Earth's own
 *     media/codex flags from the live PKF manifest
 *   - bcv-commons/bibles' live media index (/dbt/_app/media-index.json) for
 *     DBT/Bible Brain audio/timing availability
 *
 * Display names (English + vernacular) come from a single source now:
 * bibles' canonical iso -> {name, vernacular} catalog
 * (/dbt/_app/language-names.json, doc/language-names.md) — see
 * language-name-catalog.ts. That catalog is itself a union of DBT/PKF/OBS
 * name sources (2,435 languages as of 2026-09-15, broader than any single
 * source above), published specifically to replace the per-app fallback
 * logic this file used to maintain — a real language (ivv/Ivatan) had a
 * name in the PKF manifest that this file's old logic hadn't been taught
 * to check, silently falling back to the raw ISO code.
 */

import pkfLangs from "../../../config/pkf-langs.json"
import { isStudyLanguage } from "./study-languages"
import { pkfUrl } from "./pkf-url"
import { loadMediaIndex } from "./dbt-media"
import { nameFromCatalog, type LanguageNameCatalog } from "./language-name-catalog"

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

export interface PkfManifestEntry {
  nm: string
  v?: string
  media: string
  codex: string
}

let pkfManifestPromise: Promise<Map<string, PkfManifestEntry>> | null = null

/** Live `/pkf/manifest.json`, normalized to an iso→entry map. Cached for the
 *  session. Backs `loadLocalPkfSet()` (dev on-disk probing) and the picker
 *  enrichment step below (Scripture-Earth media/codex flags — NOT names
 *  anymore, since 2026-09-15: see language-name-catalog.ts). */
export function loadPkfManifest(): Promise<Map<string, PkfManifestEntry>> {
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

  // 1. ALL-langs catalog → categories only now (names come from bibles'
  // canonical catalog in step 3 below — see its comment). Still worth this
  // pass on its own since `category` (e.g. "with-timecode") isn't in that
  // catalog at all, and this seeds entries for every ALL-langs-known iso
  // regardless of whether it happened to have a usable name there.
  try {
    const resp = await fetch("/ALL-langs-compact.json")
    const data = await resp.json()
    if (data.canons) {
      for (const categories of Object.values(data.canons) as any[]) {
        for (const [catName, langs] of Object.entries(categories) as any[]) {
          for (const iso of Object.keys(langs)) {
            if (byIso.has(iso)) continue
            byIso.set(iso, {
              iso,
              name: iso.toUpperCase(),
              vernacular: iso.toUpperCase(),
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

  // 2. .pkf languages not in the catalog (the ~39) → add (name filled by
  // step 3 below).
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

  // 3. bcv-commons/bibles' canonical iso -> {name, vernacular} catalog
  // (doc/language-names.md; see language-name-catalog.ts) — unions
  // DBT/PKF/OBS name sources, so this both fills in every ISO-uppercase
  // placeholder set above AND adds languages neither ALL-langs nor the
  // static .pkf list know about at all (e.g. the ~87 OBS-only languages
  // the catalog unions in) — real additional coverage for "pick a
  // language" UIs like this one, which is exactly what that file is
  // published for. Replaces this step's old live-PKF-manifest name
  // resolution (still fetched for its audio/timing/codex fields below,
  // just no longer for names).
  try {
    const resp = await fetch(pkfUrl("/dbt/_app/language-names.json"))
    if (resp.ok) {
      const catalog: LanguageNameCatalog = await resp.json()
      for (const iso of Object.keys(catalog.l)) {
        const resolved = nameFromCatalog(catalog, iso)
        if (!resolved) continue
        const entry = byIso.get(iso)
        if (entry) {
          entry.name = resolved.n
          entry.vernacular = resolved.v
        } else {
          byIso.set(iso, {
            iso,
            name: resolved.n,
            vernacular: resolved.v,
            pkf: PKF_SET.has(iso),
            study: isStudyLanguage(iso),
          })
        }
      }
    }
  } catch (e) {
    console.warn("Failed to load bibles' language-names catalog:", e)
  }

  // 4. Live PKF manifest (/pkf/manifest.json) → Scripture-Earth's own
  // media/codex flags for .pkf languages. `media` here is SE-scope only
  // (spec §3) — OR'd with the DBT index in step 5 below for the full
  // picture, never overwritten. Names no longer come from here (step 3
  // above already resolved them, from the same manifest data bibles'
  // catalog itself draws on — see doc/language-names.md's "Sources").
  try {
    const pkfManifest = await loadPkfManifest()
    for (const [iso, e] of pkfManifest) {
      const seAudio = e.media.includes("a")
      const seTiming = e.media.includes("t")
      const entry = byIso.get(iso)
      if (entry) {
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

  // 5. Live CDN media index (/dbt/_app/media-index.json) → DBT/Bible Brain
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
        // media-index.json has no cached display name for ~200 of its
        // ~2,500 languages (real gap in the live CDN data, not a bug in
        // this parsing) — fall back to the raw iso code rather than
        // leaving `name` undefined, which used to crash the sort below for
        // every visitor, not just these languages.
        const name = avail.name || iso.toUpperCase()
        byIso.set(iso, {
          iso,
          name,
          vernacular: avail.vernacular || name,
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

  cache = [...byIso.values()].sort((a, b) => (a.name || a.iso).localeCompare(b.name || b.iso))
  return cache
}
