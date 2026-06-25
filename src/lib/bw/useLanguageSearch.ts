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
import { buildPickerLanguages, type PickerLanguage } from "./language-list"
import { PICKER_POPULAR_LANGUAGES } from "./popular-languages"

const RECENT_KEY = "bibel-wiki-recent-langs"
const MAX_RECENTS = 5

export interface LanguageSection {
  id: "recent" | "pkf" | "popular" | "all"
  items: PickerLanguage[]
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

  // Non-empty query → single ranked flat list.
  const results = useMemo<PickerLanguage[] | null>(() => {
    const q = norm(query.trim())
    if (!q) return null
    const scored: Array<{ lang: PickerLanguage; s: number }> = []
    for (const lang of all) {
      const s = score(lang, q)
      if (s !== null) scored.push({ lang, s })
    }
    scored.sort((a, b) => {
      if (a.s !== b.s) return a.s - b.s
      if (a.lang.pkf !== b.lang.pkf) return a.lang.pkf ? -1 : 1 // .pkf up on ties
      return a.lang.name.localeCompare(b.lang.name)
    })
    return scored.map((x) => x.lang)
  }, [all, query])

  // Empty query → tiered sections.
  const sections = useMemo<LanguageSection[] | null>(() => {
    if (query.trim() || loading) return null
    const out: LanguageSection[] = []

    const recents = getRecentLangs()
      .map((c) => byIso.get(c))
      .filter((l): l is PickerLanguage => !!l)
    if (recents.length) out.push({ id: "recent", items: recents })

    const pkf = all.filter((l) => l.pkf)
    if (pkf.length) out.push({ id: "pkf", items: pkf })

    const popularSet = new Set<string>(PICKER_POPULAR_LANGUAGES as readonly string[])
    const popular = all.filter((l) => popularSet.has(l.iso) && !l.pkf)
    if (popular.length) out.push({ id: "popular", items: popular })

    out.push({ id: "all", items: all })
    return out
  }, [all, byIso, query, loading])

  return { query, setQuery, loading, results, sections, total: all.length }
}
