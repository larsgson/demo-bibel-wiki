import { atom, computed } from "nanostores"
import languagePreferences from "../data/language-preferences.json"
import { setIso } from "./iso-store"
import { isStudyLanguage } from "../lib/bw/study-languages"
import { loadLanguageMedia, type CanonMedia } from "../lib/bw/dbt-media"

// Always initialize with defaults to match server-rendered HTML.
// Actual values are hydrated from URL in initLanguageFromUrl().
export const $selectedLanguage = atom<string>("eng")
export const $secondaryLanguages = atom<string[]>([])

export const $languageNames = atom<Record<string, { n: string; v: string }>>({})
export const $languageData = atom<Record<string, any>>({})

export const $selectedLanguages = computed(
  [$selectedLanguage, $secondaryLanguages],
  (primary, secondaries) => {
    const langs = [primary]
    for (const s of secondaries) {
      if (s !== primary) langs.push(s)
    }
    return langs
  },
)

export const $engIsExplicit = computed(
  [$selectedLanguage, $secondaryLanguages],
  (primary, secondaries) => primary === "eng" || secondaries.includes("eng"),
)

// The currently-targeted study language: the first study-capable language in
// selection order (primary first, then secondaries). Null when none of the
// selected languages is study-capable. Study UI targets this language.
export const $activeStudyLang = computed($selectedLanguages, (langs) => {
  return langs.find((l) => isStudyLanguage(l)) ?? null
})

// `language-store` is the canonical selection. `$selectedIso` (iso-store) is a
// one-way mirror of the PRIMARY only, for URL/title/link consumers. Keep it in
// step whenever the primary changes. Multi-language features must read
// `$selectedLanguages`/`$secondaryLanguages`, never `$selectedIso`.
$selectedLanguage.subscribe((primary) => setIso(primary))

export function setLanguage(lang: string) {
  $selectedLanguage.set(lang)
  if (typeof window !== "undefined") {
    updateUrlParams()
  }
}

export function addSecondaryLanguage(lang: string) {
  const current = $secondaryLanguages.get()
  if (current.includes(lang)) return
  const updated = [...current, lang]
  $secondaryLanguages.set(updated)
  if (typeof window !== "undefined") {
    localStorage.setItem("secondaryLanguages", updated.join(","))
    updateUrlParams()
  }
}

export function removeSecondaryLanguage(lang: string) {
  const updated = $secondaryLanguages.get().filter((l) => l !== lang)
  $secondaryLanguages.set(updated)
  if (typeof window !== "undefined") {
    if (updated.length > 0) {
      localStorage.setItem("secondaryLanguages", updated.join(","))
    } else {
      localStorage.removeItem("secondaryLanguages")
    }
    updateUrlParams()
  }
}

export function clearSecondaryLanguages() {
  $secondaryLanguages.set([])
  if (typeof window !== "undefined") {
    localStorage.removeItem("secondaryLanguages")
    updateUrlParams()
  }
}

function isOnGenericRoute() {
  const parts = window.location.pathname.split("/").filter(Boolean)
  // /l/... routes or bare /OBS/... routes (no lang prefix)
  return parts[0] === "l" || !(parts.length >= 1 && /^[a-z]{3}$/.test(parts[0]))
}

function updateUrlParams() {
  if (typeof window === "undefined") return

  const url = new URL(window.location.href)
  const langs = $secondaryLanguages.get()

  if (isOnGenericRoute()) {
    // On /l/ routes, keep ?lang= in sync for non-eng languages
    const lang = $selectedLanguage.get()
    if (lang && lang !== "eng") {
      url.searchParams.set("lang", lang)
    } else {
      url.searchParams.delete("lang")
    }
  } else {
    // On /<lang>/ routes, lang is in the path — no ?lang= needed
    url.searchParams.delete("lang")
  }

  // Remove old lang2 param if present
  url.searchParams.delete("lang2")

  if (langs.length > 0) {
    url.searchParams.set("langs", langs.join(","))
  } else {
    url.searchParams.delete("langs")
  }
  window.history.replaceState({}, "", url.toString())
}

function readSecondaryLangsFromStorage(): string[] {
  // Try new key first, then migrate from old key
  const stored = localStorage.getItem("secondaryLanguages")
  if (stored) return stored.split(",").filter(Boolean)

  const old = localStorage.getItem("secondaryLanguage")
  if (old) {
    // Migrate old format
    localStorage.setItem("secondaryLanguages", old)
    localStorage.removeItem("secondaryLanguage")
    return [old]
  }
  return []
}

export function initLanguageFromUrl() {
  if (typeof window === "undefined") return

  // 1. Check URL path pattern: /:lang/Template/...
  const pathParts = window.location.pathname.split("/").filter(Boolean)
  if (pathParts.length >= 1) {
    const [maybeLang] = pathParts
    if (/^[a-z]{3}$/.test(maybeLang) && maybeLang !== "l") {
      $selectedLanguage.set(maybeLang)
      const stored = readSecondaryLangsFromStorage()
      if (stored.length > 0) $secondaryLanguages.set(stored)
      return
    }
  }

  // 2. Check ?lang= query param (used by Netlify rewrite and dev mode)
  const params = new URLSearchParams(window.location.search)
  const lang = params.get("lang")
  const langsParam = params.get("langs")
  // Backward compat: support old ?lang2= param
  const lang2 = params.get("lang2")

  if (lang) {
    $selectedLanguage.set(lang)
  }
  // No localStorage fallback — if no lang in URL, default "eng" stands

  if (langsParam) {
    const langs = langsParam.split(",").filter(Boolean)
    $secondaryLanguages.set(langs)
    localStorage.setItem("secondaryLanguages", langs.join(","))
  } else if (lang2) {
    // Migrate from old ?lang2= format
    $secondaryLanguages.set([lang2])
    localStorage.setItem("secondaryLanguages", lang2)
  } else {
    const stored = readSecondaryLangsFromStorage()
    if (stored.length > 0) $secondaryLanguages.set(stored)
  }
}

// Auto-initialize language from URL on module load,
// so all components see the correct language from their first render.
initLanguageFromUrl()

let languageNamesLoaded = false

export async function loadLanguageNames() {
  if (languageNamesLoaded) return
  languageNamesLoaded = true
  try {
    const resp = await fetch("/ALL-langs-compact.json")
    const data = await resp.json()
    const names: Record<string, { n: string; v: string }> = {}
    const audioOnlyLangs = new Set<string>()
    if (data.canons) {
      // First pass: collect all languages and track which are audio-only
      const allLangs = new Map<string, { n: string; v: string }>()
      for (const [, categories] of Object.entries(data.canons) as any[]) {
        for (const [catName, langs] of Object.entries(categories) as any[]) {
          for (const [code, info] of Object.entries(langs) as any[]) {
            if (info.n && !allLangs.has(code)) {
              allLangs.set(code, { n: info.n, v: info.v || info.n })
            }
            if (catName === "audio-only") {
              audioOnlyLangs.add(code)
            }
          }
        }
      }
      // Only include languages that appear in a non-audio-only category
      for (const [code, info] of allLangs) {
        const hasText = !audioOnlyLangs.has(code) ||
          Object.values(data.canons).some((categories: any) =>
            Object.entries(categories).some(([cat, langs]: any) =>
              cat !== "audio-only" && langs[code]
            )
          )
        if (hasText) {
          names[code] = info
        }
      }
    }
    $languageNames.set(names)
  } catch (e) {
    console.warn("Failed to load language names:", e)
  }
}

/**
 * Classify a canon's fileset coverage into the same taxonomy the old
 * ALL-langs-data manifest used, since StoryReaderIsland branches on these
 * exact string values (TIMING_CATS.includes(category)). /dbt/<iso>/media.json
 * doesn't carry this taxonomy directly, but has everything needed to derive
 * it: timingBooks (>0 means some real per-verse timing exists for this
 * canon) plus whether the fileset actually carries text (`t`) and/or audio
 * (`a`) at all.
 */
function classifyCategory(canonMedia: CanonMedia, hasText: boolean, hasAudio: boolean): string {
  const hasTiming = (canonMedia.timingBooks ?? 0) > 0
  if (hasTiming && hasText) return "with-timecode"
  if (hasTiming) return "audio-with-timecode"
  if (hasText && hasAudio) return "syncable"
  if (hasText) return "text-only"
  return "audio-only"
}

const langDataPromises: Record<string, Promise<any> | undefined> = {}

/**
 * Resolve fileset info for a language from cdn.bibel.wiki's live
 * /dbt/<iso>/media.json (see src/lib/bw/dbt-media.ts) — replaces the old
 * static ALL-langs-data/manifest.json + per-fileset data.json tree fetched
 * from bible-story-builder's GitHub releases (retired 2026-09 once that
 * repo went private; the CDN already aggregates this same DBT fileset data
 * live, per language, so there's no need for a second, separately-built
 * copy of it). Return shape is unchanged from the old implementation —
 * {langCode, canon, category, distinctId, data: {a, t}, canonData?} — so
 * every existing consumer (StoryReaderIsland.tsx) needed no changes.
 */
export async function loadLanguageData(langCode: string) {
  const existing = $languageData.get()
  if (existing[langCode]) return existing[langCode]

  if (langDataPromises[langCode]) return langDataPromises[langCode]

  langDataPromises[langCode] = (async () => {
    const media = await loadLanguageMedia(langCode)
    if (!media) return null

    // Use language preferences to prioritize preferred fileset (supports per-canon)
    const prefRaw = (languagePreferences as Record<string, any>)[langCode]?.preferredFileset || null
    const getPreferred = (canon: string): string | null => {
      if (!prefRaw) return null
      if (typeof prefRaw === "string") return prefRaw
      return prefRaw[canon] || null
    }

    let result: any = null
    const canonResults: Record<string, any> = {}

    for (const canon of ["nt", "ot"] as const) {
      const canonMedia = media.canons[canon]
      if (!canonMedia?.filesets?.length) continue

      const preferredFileset = getPreferred(canon)
      const fileset = preferredFileset
        ? canonMedia.filesets.find((f) => f.id === preferredFileset) ?? canonMedia.filesets[0]
        : canonMedia.filesets[0]

      const hasText = !!fileset.t
      const hasAudio = !!fileset.a?.length
      if (!hasText && !hasAudio) continue

      // fileset.t from /dbt/<iso>/media.json is just the fileset's BASE id
      // (identical to fileset.id) — it does NOT include the testament
      // letter DBT's real text-fileset ids need (confirmed directly
      // against the DBT API: a fileset "ASMDPI" has separate real text
      // filesets "ASMDPIN_ET"/"ASMDPIN_ET-json" for NT and
      // "ASMDPIO_ET"/"ASMDPIO_ET-json" for OT — "ASMDPI_ET" alone doesn't
      // exist). parseTextFilesetId (fileset-utils.ts) expects the OLD
      // ALL-langs-data convention instead: a short suffix ("N_ET"/"O_ET")
      // that it prepends the distinctId onto — so build that suffix here
      // from the canon rather than passing fileset.t through unchanged
      // (passing it through was the bug: "AHRDPI" resolves to itself,
      // never gains the required "N"/"O", and 404s against the real API).
      // Audio needs no such reconstruction — fileset.a already gives the
      // complete, real fileset id (e.g. "AHRDPIN1DA") directly.
      const testamentLetter = canon === "nt" ? "N" : "O"
      const canonResult = {
        langCode,
        canon,
        category: classifyCategory(canonMedia, hasText, hasAudio),
        distinctId: fileset.id,
        data: { a: fileset.a?.[0], t: hasText ? `${testamentLetter}_ET` : undefined },
      }

      canonResults[canon] = canonResult
      // Prefer with-timecode as the primary result
      if (!result || (canonResult.category === "with-timecode" && result.category !== "with-timecode")) {
        result = canonResult
      }
    }

    // If we have both canons, mark as full-bible coverage
    if (result && canonResults.nt && canonResults.ot) {
      result.canon = "full"
      result.canonData = canonResults
    }

    if (result) {
      $languageData.set({ ...$languageData.get(), [langCode]: result })
    }
    return result
  })()

  return langDataPromises[langCode]
}
