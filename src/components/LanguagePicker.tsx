import { useEffect, useRef } from "react"
import { useLanguageSearch, addRecentLang, type LanguageSection } from "../lib/bw/useLanguageSearch"
import type { PickerLanguage } from "../lib/bw/language-list"
import { t as translate } from "../lib/bw/ui-locales"
import "../styles/language-picker.css"

interface Props {
  open: boolean
  onClose: () => void
  onSelect: (iso: string) => void
  /** Currently-selected iso(s) to mark as active in the list. */
  selected?: string[]
  title?: string
  lang?: string
}

// Section id → locale key (labels live in the locale files).
const SECTION_KEY: Record<LanguageSection["id"], string> = {
  recent: "picker.recent",
  region: "picker.thisRegion",
  pkf: "regionLanding.fullTextAudio",
  popular: "picker.popular",
  all: "picker.allLanguages",
}

function LanguageRow({
  lang,
  selected,
  onSelect,
  uiLang,
}: {
  lang: PickerLanguage
  selected: boolean
  onSelect: (iso: string) => void
  uiLang: string
}) {
  return (
    <button
      type="button"
      className={`lang-row ${selected ? "selected" : ""}`}
      onClick={() => onSelect(lang.iso)}
      aria-pressed={selected}
    >
      <span className="lang-row-names">
        <span className="lang-row-vernacular">{lang.vernacular}</span>
        {lang.name !== lang.vernacular && (
          <span className="lang-row-english"> · {lang.name}</span>
        )}
      </span>
      {lang.pkf && (
        <span className="lang-badge lang-badge-pkf" title={translate(uiLang, "regionLanding.fullTextAudio")}>📖</span>
      )}
      {lang.timing ? (
        <span className="lang-badge lang-badge-timing" title={translate(uiLang, "picker.hasTiming")}>⏱</span>
      ) : lang.audio ? (
        <span className="lang-badge lang-badge-audio" title={translate(uiLang, "picker.hasAudio")}>🔊</span>
      ) : null}
      {lang.study && (
        <span className="lang-badge lang-badge-study" title={translate(uiLang, "regionLanding.studyAvailable")}>✦</span>
      )}
    </button>
  )
}

export default function LanguagePicker({
  open,
  onClose,
  onSelect,
  selected = [],
  title,
  lang = "en",
}: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const {
    query, setQuery, loading, results, sections,
    regionTierLabel, filterChips, activeFilter, setActiveFilter,
  } = useLanguageSearch()
  const tr = (k: string) => translate(lang, `picker.${k}`)
  const selectedSet = new Set(selected)

  // The "region" section uses the region's own tier label (from its TOML).
  const sectionLabel = (id: LanguageSection["id"]) =>
    id === "region" && regionTierLabel
      ? regionTierLabel[lang] ?? regionTierLabel.en
      : translate(lang, SECTION_KEY[id])

  // Drive the native <dialog> open/close from the `open` prop.
  useEffect(() => {
    const d = dialogRef.current
    if (!d) return
    if (open && !d.open) d.showModal()
    if (!open && d.open) d.close()
  }, [open])

  function handleSelect(iso: string) {
    addRecentLang(iso)
    onSelect(iso)
  }

  return (
    <dialog
      ref={dialogRef}
      className="lang-dialog"
      onClose={onClose}
      onClick={(e) => {
        // Backdrop click (target is the dialog element itself) closes.
        if (e.target === dialogRef.current) onClose()
      }}
    >
      <div className="lang-sheet">
        <div className="lang-sheet-header">
          <div className="lang-sheet-titlebar">
            <span className="lang-sheet-title">{title ?? tr("pick")}</span>
            <button
              type="button"
              className="lang-sheet-close"
              aria-label={translate(lang, "biblePicker.close")}
              onClick={onClose}
            >
              ✕
            </button>
          </div>
          <input
            type="text"
            className="lang-search"
            placeholder={tr("search")}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            autoFocus
          />
          {filterChips.length > 0 && (
            <div className="lang-filters">
              {filterChips.map((chip) => (
                <button
                  key={chip.slug}
                  type="button"
                  className={`lang-filter-chip ${activeFilter === chip.slug ? "active" : ""}`}
                  onClick={() =>
                    setActiveFilter(activeFilter === chip.slug ? null : chip.slug)
                  }
                >
                  {chip.name[lang] ?? chip.name.en}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="lang-list">
          {loading ? (
            <div className="lang-empty">…</div>
          ) : results ? (
            results.length === 0 ? (
              <div className="lang-empty">{tr("none")}</div>
            ) : (
              results.map((l) => (
                <LanguageRow
                  key={l.iso}
                  lang={l}
                  selected={selectedSet.has(l.iso)}
                  onSelect={handleSelect}
                  uiLang={lang}
                />
              ))
            )
          ) : (
            sections?.map((section) => (
              <div key={section.id}>
                <div className="lang-section-label">
                  {sectionLabel(section.id)}
                </div>
                {section.items.map((l) => (
                  <LanguageRow
                    key={`${section.id}-${l.iso}`}
                    lang={l}
                    selected={selectedSet.has(l.iso)}
                    onSelect={handleSelect}
                    uiLang={lang}
                  />
                ))}
              </div>
            ))
          )}
        </div>
      </div>
    </dialog>
  )
}
