import { useState, useEffect, useMemo, useRef, useCallback } from "react"
import { useStore } from "@nanostores/react"
import {
  $selectedLanguage,
  $secondaryLanguages,
  setLanguage,
  addSecondaryLanguage,
  removeSecondaryLanguage,
  clearSecondaryLanguages,
} from "../stores/language-store"
import { t, resolveUILang } from "../lib/bw/ui-locales"

interface Language {
  code: string
  english: string
  vernacular: string
  category: string
}

interface Props {
  mode: "primary" | "secondary"
  onClose: () => void
}

// 7 most spoken languages by number of speakers (ISO 639-3 codes used in DBT)
const QUICK_PICK_CODES = ["eng", "cmn", "hin", "spa", "arb", "fra", "por"]

const RECENT_KEY = "bibel-wiki-recent-langs"
const MAX_RECENTS = 5

function getRecentLangs(): string[] {
  try {
    const stored = localStorage.getItem(RECENT_KEY)
    return stored ? JSON.parse(stored) : []
  } catch { return [] }
}

function addRecentLang(code: string) {
  try {
    const recents = getRecentLangs().filter((c) => c !== code)
    recents.unshift(code)
    localStorage.setItem(RECENT_KEY, JSON.stringify(recents.slice(0, MAX_RECENTS)))
  } catch { /* ignore */ }
}

/** Wrap matching substring in <mark> tags */
function highlightMatch(text: string, search: string) {
  if (!search) return text
  const idx = text.toLowerCase().indexOf(search.toLowerCase())
  if (idx < 0) return text
  return (
    <>
      {text.slice(0, idx)}
      <mark className="bg-yellow-200 rounded-sm px-0.5">{text.slice(idx, idx + search.length)}</mark>
      {text.slice(idx + search.length)}
    </>
  )
}

export default function LanguageSelectorIsland({ mode, onClose }: Props) {
  const selectedLang = useStore($selectedLanguage)
  const secondaryLangs = useStore($secondaryLanguages)
  const [searchTerm, setSearchTerm] = useState("")
  const [languages, setLanguages] = useState<Language[]>([])
  const [loading, setLoading] = useState(true)
  const [highlightIdx, setHighlightIdx] = useState(-1)
  const [recentCodes] = useState(() => getRecentLangs())
  const listRef = useRef<HTMLDivElement>(null)
  const uiLang = resolveUILang(selectedLang, secondaryLangs)

  useEffect(() => {
    fetch("/ALL-langs-compact.json")
      .then((r) => r.json())
      .then((data) => {
        const langList: Language[] = []
        if (data.canons) {
          // Collect all languages and track their categories across both canons
          const langInfo = new Map<string, { n: string; v: string; cat: string }>()
          const audioOnlyLangs = new Set<string>()
          const nonAudioOnlyLangs = new Set<string>()
          for (const categories of Object.values(data.canons) as any[]) {
            for (const [catName, langs] of Object.entries(categories) as any[]) {
              for (const [code, info] of Object.entries(langs) as any[]) {
                if (!langInfo.has(code)) {
                  langInfo.set(code, { n: info.n, v: info.v || info.n, cat: catName })
                }
                if (catName === "audio-only") {
                  audioOnlyLangs.add(code)
                } else {
                  nonAudioOnlyLangs.add(code)
                }
              }
            }
          }
          // Only include languages that have text or timing (not audio-only exclusive)
          for (const [code, info] of langInfo) {
            if (audioOnlyLangs.has(code) && !nonAudioOnlyLangs.has(code)) continue
            langList.push({
              code,
              english: info.n,
              vernacular: info.v,
              category: info.cat,
            })
          }
        }
        langList.sort((a, b) => a.english.localeCompare(b.english))
        setLanguages(langList)
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [])

  // Quick picks: recent languages first, then top spoken languages (only those available)
  const quickPicks = useMemo(() => {
    if (!languages.length) return []
    const picks: Language[] = []
    const added = new Set<string>()
    const excludeCode = mode === "primary" ? null : selectedLang

    // Add recents first
    for (const code of recentCodes) {
      if (code === excludeCode) continue
      const lang = languages.find((l) => l.code === code)
      if (lang && !added.has(code)) {
        picks.push(lang)
        added.add(code)
      }
    }

    // Fill with top spoken languages
    for (const code of QUICK_PICK_CODES) {
      if (code === excludeCode) continue
      if (added.has(code)) continue
      const lang = languages.find((l) => l.code === code)
      if (lang) {
        picks.push(lang)
        added.add(code)
      }
    }

    return picks.slice(0, 7)
  }, [languages, recentCodes, mode, selectedLang])

  // Only show search results after 2+ characters
  const searchResults = useMemo(() => {
    const search = searchTerm.trim().toLowerCase()
    if (search.length < 2) return []
    const excludeCode = mode === "primary" ? null : selectedLang
    return languages
      .filter((l) => l.code !== excludeCode)
      .filter(
        (l) =>
          l.english.toLowerCase().includes(search) ||
          l.vernacular.toLowerCase().includes(search) ||
          l.code.toLowerCase().includes(search),
      )
  }, [languages, searchTerm, mode, selectedLang])

  // Reset highlight when results change
  useEffect(() => {
    setHighlightIdx(searchResults.length > 0 ? 0 : -1)
  }, [searchResults.length])

  const handleSelect = useCallback((lang: Language) => {
    addRecentLang(lang.code)
    if (mode === "primary") {
      setLanguage(lang.code)
      onClose()
    } else {
      if (secondaryLangs.includes(lang.code)) {
        removeSecondaryLanguage(lang.code)
      } else {
        addSecondaryLanguage(lang.code)
      }
    }
  }, [mode, secondaryLangs, onClose])

  // Scroll highlighted item into view
  useEffect(() => {
    if (highlightIdx < 0 || !listRef.current) return
    const el = listRef.current.querySelector(`[data-idx="${highlightIdx}"]`)
    if (el) el.scrollIntoView({ block: "nearest" })
  }, [highlightIdx])

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    const len = searchResults.length
    if (!len) return

    if (e.key === "ArrowDown") {
      e.preventDefault()
      setHighlightIdx((i) => (i + 1) % len)
    } else if (e.key === "ArrowUp") {
      e.preventDefault()
      setHighlightIdx((i) => (i <= 0 ? len - 1 : i - 1))
    } else if (e.key === "Enter" && highlightIdx >= 0 && highlightIdx < len) {
      e.preventDefault()
      handleSelect(searchResults[highlightIdx])
    } else if (e.key === "Escape") {
      e.preventDefault()
      onClose()
    }
  }, [searchResults, highlightIdx, handleSelect, onClose])

  const isSelected = (code: string) => {
    if (mode === "primary") return code === selectedLang
    return secondaryLangs.includes(code)
  }

  const search = searchTerm.trim()
  const showResults = search.length >= 2

  return (
    <div
      className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="rounded-lg w-full max-w-md max-h-[80vh] flex flex-col"
        style={{ backgroundColor: "var(--bg)", color: "var(--text)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-4 border-b" style={{ borderColor: "var(--border, #e5e7eb)" }}>
          <h2 className="text-lg font-semibold" style={{ color: "var(--text)" }}>
            {mode === "primary" ? t(uiLang, "languageSelector.title") : t(uiLang, "languageSelector.selectSecondaryLanguages")}
          </h2>
          <button
            onClick={onClose}
            className="text-xl opacity-60 hover:opacity-100"
            style={{ color: "var(--text)" }}
            aria-label={t(uiLang, "languageSelector.close")}
          >
            &times;
          </button>
        </div>

        {/* Quick picks */}
        {!showResults && quickPicks.length > 0 && (
          <div className="p-3 flex flex-wrap gap-2">
            {quickPicks.map((lang) => {
              const selected = isSelected(lang.code)
              return (
                <button
                  key={lang.code}
                  onClick={() => handleSelect(lang)}
                  className={`px-3 py-1.5 rounded-full text-sm border transition-colors ${
                    selected ? "font-semibold" : ""
                  }`}
                  style={{
                    borderColor: selected ? "var(--accent, #60a5fa)" : "var(--border, #d1d5db)",
                    backgroundColor: selected ? "var(--accent, #60a5fa)" : "color-mix(in srgb, var(--text) 15%, var(--bg))",
                    color: selected ? "var(--bg, #fff)" : "var(--text)",
                    opacity: selected ? 1 : 0.8,
                  }}
                >
                  {lang.english}
                  {selected && " \u2713"}
                </button>
              )
            })}
          </div>
        )}

        {/* Search input */}
        <div className="px-3 pb-3">
          <input
            type="text"
            className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2"
            style={{ borderColor: "var(--border, #d1d5db)", backgroundColor: "var(--bg)", color: "var(--text)", "--tw-ring-color": "var(--accent, #60a5fa)" } as any}
            placeholder={t(uiLang, "languageSelector.typeLangName")}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            onKeyDown={handleKeyDown}
            autoFocus
          />
          {search.length === 1 && (
            <div className="text-xs mt-1 px-1" style={{ color: "var(--text)", opacity: 0.5 }}>{t(uiLang, "languageSelector.typeOneMore")}</div>
          )}
        </div>

        {/* Search results */}
        {showResults && (
          <div className="flex-1 overflow-y-auto px-3 pb-3" ref={listRef}>
            {mode === "secondary" && secondaryLangs.length > 0 && (
              <button
                onClick={() => { clearSecondaryLanguages(); onClose() }}
                className="w-full text-left px-3 py-2 rounded-md mb-1"
                style={{ color: "var(--text)", opacity: 0.7 }}
              >
                <em>{t(uiLang, "languageSelector.clearAll")}</em>
              </button>
            )}
            {searchResults.map((lang, idx) => {
              const selected = isSelected(lang.code)
              const highlighted = idx === highlightIdx
              return (
                <button
                  key={lang.code}
                  data-idx={idx}
                  onClick={() => handleSelect(lang)}
                  onMouseEnter={() => setHighlightIdx(idx)}
                  className={`w-full text-left px-3 py-2 rounded-md mb-1 flex items-center gap-2 ${
                    selected ? "font-semibold" : ""
                  }`}
                  style={{
                    color: "var(--text)",
                    backgroundColor: highlighted ? "var(--accent, #3b82f6)" : "transparent",
                    opacity: highlighted ? 0.9 : 1,
                  }}
                >
                  <div className="flex-1 min-w-0">
                    <div className="truncate">
                      {highlightMatch(lang.english, search)}
                      {selected && " \u2713"}
                    </div>
                    {lang.vernacular !== lang.english && (
                      <div className="text-sm truncate" style={{ color: "var(--text)", opacity: 0.6 }}>
                        {highlightMatch(lang.vernacular, search)}
                      </div>
                    )}
                  </div>
                  <span className="text-xs flex-shrink-0" style={{ color: "var(--text)", opacity: 0.4 }}>
                    {highlightMatch(lang.code, search)}
                  </span>
                </button>
              )
            })}
            {searchResults.length === 0 && (
              <div className="text-center py-4" style={{ color: "var(--text)", opacity: 0.5 }}>
                {t(uiLang, "languageSelector.noLangsFound")} &ldquo;{searchTerm}&rdquo;
              </div>
            )}
          </div>
        )}

        <div className="p-3 border-t" style={{ borderColor: "var(--border, #e5e7eb)" }}>
          <button
            onClick={onClose}
            className="w-full py-2 px-4 rounded-md"
            style={{ backgroundColor: "var(--accent, #e5e7eb)", color: "var(--bg, #1f2937)", opacity: 0.9 }}
          >
            {mode === "secondary" ? t(uiLang, "languageSelector.done") : t(uiLang, "languageSelector.close")}
          </button>
        </div>
      </div>
    </div>
  )
}
