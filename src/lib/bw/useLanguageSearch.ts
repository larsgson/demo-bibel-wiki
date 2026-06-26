/**
 * Search + tiered sectioning for the language picker.
 *
 * Phase 1: dependency-free, diacritic-insensitive, multi-field ranked match
 * (vernacular endonym + English exonym + ISO code). MiniSearch + virtualization
 * are deferred to a later phase; this is correct and fast enough for ~2176 rows.
 *
 * Empty query → tiered sections (Recent / .pkf / Popular / All).
 * Non-empty query → a single ranked flat list, `.pkf` weighted up on ties.
 */

import { useEffect, useMemo, useState } from "react"
import { useStore } from "@nanostores/react"
import { buildPickerLanguages, type PickerLanguage } from "./language-list"
import { PICKER_POPULAR_LANGUAGES } from "./popular-languages"
import { $activeRegion } from "../../stores/region-store"
import { regionConfigByCode, type Localized } from "../data/region-config"

const RECENT_KEY = "bibel-wiki-recent-langs"
const MAX_RECENTS = 5

export interface LanguageSection {
  id: "recent" | "region" | "pkf" | "popular" | "all"
  items: PickerLanguage[]
}

export interface FilterChip {
  slug: string
  name: Localized
}

export function getRecentLangs(): string[] {
  try {
    const raw = localStorage.getItem(RECENT_KEY)
    return raw ? (JSON.parse(raw) as string[]) : []
  } catch {
    return []
  }
}

export function addRecentLang(code: string) {
  try {
    const recents = [code, ...getRecentLangs().filter((c) => c !== code)]
    localStorage.setItem(RECENT_KEY, JSON.stringify(recents.slice(0, MAX_RECENTS)))
  } catch {
    /* ignore */
  }
}

/** Diacritic-insensitive, lowercased normalization for matching. */
function norm(s: string): string {
  return s.normalize("NFD").replace(/\p{Mn}/gu, "").toLowerCase()
}

/** Match score for one language against a normalized query. Lower = better.
 *  Returns null when there is no match on any field. */
function score(lang: PickerLanguage, q: string): number | null {
  const fields = [lang.vernacular, lang.name, lang.iso]
  let best: number | null = null
  for (const f of fields) {
    const nf = norm(f)
    let s: number | null = null
    if (nf === q) s = 0
    else if (nf.startsWith(q)) s = 1
    else if (nf.includes(q)) s = 2
    if (s !== null && (best === null || s < best)) best = s
  }
  return best
}

export function useLanguageSearch() {
  const [all, setAll] = useState<PickerLanguage[]>([])
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState("")
  const [activeFilter, setActiveFilter] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    buildPickerLanguages().then((list) => {
      if (!alive) return
      setAll(list)
      setLoading(false)
    })
    return () => {
      alive = false
    }
  }, [])

  const byIso = useMemo(() => {
    const m = new Map<string, PickerLanguage>()
    for (const l of all) m.set(l.iso, l)
    return m
  }, [all])

  // Active region (from the region-store) → its config, tier label, and the
  // grouping that powers the picker's filter chips.
  const activeRegion = useStore($activeRegion)
  const regionCfg = activeRegion ? regionConfigByCode.get(activeRegion) ?? null : null
  const regionLangSet = useMemo(
    () => new Set(regionCfg?.languages ?? []),
    [regionCfg],
  )
  const filterGrouping = useMemo(
    () => regionCfg?.grouping.find((g) => g.id === (regionCfg.picker?.filterBy ?? "")),
    [regionCfg],
  )
  const filterChips: FilterChip[] = filterGrouping?.group.map((g) => ({ slug: g.slug, name: g.name })) ?? []
  const filterLangSet = useMemo(() => {
    if (!activeFilter || !filterGrouping) return null
    const grp = filterGrouping.group.find((g) => g.slug === activeFilter)
    return grp ? new Set(grp.languages) : null
  }, [activeFilter, filterGrouping])

  // Drop a stale filter if the region (and thus its groupings) changes.
  useEffect(() => { setActiveFilter(null) }, [activeRegion])

  const passesFilter = (l: PickerLanguage) => !filterLangSet || filterLangSet.has(l.iso)

  // Non-empty query → single ranked flat list.
  const results = useMemo<PickerLanguage[] | null>(() => {
    const q = norm(query.trim())
    if (!q) return null
    const scored: Array<{ lang: PickerLanguage; s: number }> = []
    for (const lang of all) {
      if (!passesFilter(lang)) continue
      const s = score(lang, q)
      if (s !== null) scored.push({ lang, s })
    }
    scored.sort((a, b) => {
      if (a.s !== b.s) return a.s - b.s
      if (a.lang.pkf !== b.lang.pkf) return a.lang.pkf ? -1 : 1 // .pkf up on ties
      return a.lang.name.localeCompare(b.lang.name)
    })
    return scored.map((x) => x.lang)
  }, [all, query, filterLangSet])

  // Empty query → tiered sections.
  const sections = useMemo<LanguageSection[] | null>(() => {
    if (query.trim() || loading) return null
    const out: LanguageSection[] = []

    // A family filter restricts everything to that group (within the region).
    if (filterLangSet) {
      const filtered = all.filter((l) => filterLangSet.has(l.iso))
      out.push({ id: "region", items: filtered })
      return out
    }

    const recents = getRecentLangs()
      .map((c) => byIso.get(c))
      .filter((l): l is PickerLanguage => !!l)
    if (recents.length) out.push({ id: "recent", items: recents })

    // This region's languages (when a region is active).
    if (regionLangSet.size) {
      const region = all.filter((l) => regionLangSet.has(l.iso))
      if (region.length) out.push({ id: "region", items: region })
    }

    const pkf = all.filter((l) => l.pkf)
    if (pkf.length) out.push({ id: "pkf", items: pkf })

    const popularSet = new Set<string>(PICKER_POPULAR_LANGUAGES as readonly string[])
    const popular = all.filter((l) => popularSet.has(l.iso) && !l.pkf)
    if (popular.length) out.push({ id: "popular", items: popular })

    out.push({ id: "all", items: all })
    return out
  }, [all, byIso, query, loading, regionLangSet, filterLangSet])

  return {
    query,
    setQuery,
    loading,
    results,
    sections,
    total: all.length,
    // Region context for the picker UI:
    regionTierLabel: regionCfg?.picker?.tierLabel ?? null,
    filterChips,
    activeFilter,
    setActiveFilter,
  }
}
