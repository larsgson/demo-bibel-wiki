import { useEffect, useRef } from "react"
import { useLanguageSearch, addRecentLang, type LanguageSection } from "../lib/bw/useLanguageSearch"
import type { PickerLanguage } from "../lib/bw/language-list"
import "../styles/language-picker.css"

interface Props {
  open: boolean
  onClose: () => void
  onSelect: (iso: string) => void
  /** Currently-selected iso(s) to mark as active in the list. */
  selected?: string[]
  title?: string
  lang?: "en" | "es"
}

const SECTION_LABELS: Record<LanguageSection["id"], Record<"en" | "es", string>> = {
  recent:  { en: "Recent",                    es: "Recientes" },
  pkf:     { en: "Full text & audio",         es: "Texto y audio completos" },
  popular: { en: "Popular",                   es: "Populares" },
  all:     { en: "All languages",             es: "Todos los idiomas" },
}

const UI = {
  en: { search: "Search languages…", none: "No languages found", pick: "Select a language" },
  es: { search: "Buscar idiomas…",   none: "No se encontraron idiomas", pick: "Selecciona un idioma" },
}

function LanguageRow({
  lang,
  selected,
  onSelect,
}: {
  lang: PickerLanguage
  selected: boolean
  onSelect: (iso: string) => void
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
        <span className="lang-badge lang-badge-pkf" title="Full text & audio">📖</span>
      )}
      {lang.study && (
        <span className="lang-badge lang-badge-study" title="Study available">✦</span>
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
  lang = "es",
}: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const { query, setQuery, loading, results, sections } = useLanguageSearch()
  const t = UI[lang]
  const selectedSet = new Set(selected)

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
            <span className="lang-sheet-title">{title ?? t.pick}</span>
            <button
              type="button"
              className="lang-sheet-close"
              aria-label="Close"
              onClick={onClose}
            >
              ✕
            </button>
          </div>
          <input
            type="text"
            className="lang-search"
            placeholder={t.search}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            autoFocus
          />
        </div>

        <div className="lang-list">
          {loading ? (
            <div className="lang-empty">…</div>
          ) : results ? (
            results.length === 0 ? (
              <div className="lang-empty">{t.none}</div>
            ) : (
              results.map((l) => (
                <LanguageRow
                  key={l.iso}
                  lang={l}
                  selected={selectedSet.has(l.iso)}
                  onSelect={handleSelect}
                />
              ))
            )
          ) : (
            sections?.map((section) => (
              <div key={section.id}>
                <div className="lang-section-label">
                  {SECTION_LABELS[section.id][lang]}
                </div>
                {section.items.map((l) => (
                  <LanguageRow
                    key={`${section.id}-${l.iso}`}
                    lang={l}
                    selected={selectedSet.has(l.iso)}
                    onSelect={handleSelect}
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
