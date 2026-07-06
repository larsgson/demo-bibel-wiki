import { useState, useEffect, useCallback, useRef } from "react"
import { useStore } from "@nanostores/react"
import { $selectedIso, initIsoFromUrl } from "../stores/iso-store"
import { showBible } from "../stores/branch-view-store"
import {
  loadAppConfig,
  booksBySection,
  parseStartRef,
} from "../lib/data/app-config"
import { t } from "../lib/bw/ui-locales"
import { sectionOf, testamentOf, sectionLabel } from "../lib/bw/bible-sections"
import { loadBookList } from "../lib/bw/book-list"
import staticBooks from "../lib/bw/bible-books"
import "../styles/bible-picker.css"

/**
 * bible-strong-style book/chapter picker.
 *
 * A modal sheet opened from a reader's title (via the global `open-bible-picker`
 * event). Books are grouped by canonical section; tapping a book expands a grid
 * of chapter numbers; tapping a chapter jumps the active reader.
 *
 * Book data comes from `app-config.books[]` for PKF/vernacular languages (spec
 * §6.4 — localised names + sections + chapter counts, no `.pkf` load needed),
 * and falls back to the static 66-book table (+ helloao vernacular names) for
 * English/BSB and Spanish/DBT, which are not on this CDN.
 */

const POS_KEY = "bw-last-position"

interface PickerBook {
  code: string
  name: string
  section: string
  testament: "OT" | "NT"
  chapters: number
}

interface Group {
  section: string
  books: PickerBook[]
}

function savedPosition(): { book: string; chapter: number } | null {
  try {
    const raw = localStorage.getItem(POS_KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

async function loadPickerBooks(iso: string): Promise<Group[]> {
  // 1. PKF languages: app-config.books[] is authoritative (localised + sectioned).
  const cfg = await loadAppConfig(iso)
  if (cfg?.books?.length) {
    return booksBySection(cfg.books).map((g) => ({
      section: g.section,
      books: g.books.map((b) => ({
        code: b.id,
        name: b.name,
        section: b.section,
        testament: b.testament,
        chapters: b.chapters,
      })),
    }))
  }

  // 2. Fallback (eng/spa): static table + helloao vernacular names + section map.
  let vernacular: Map<string, string> | null = null
  if (iso !== "eng") {
    const list = await loadBookList(iso)
    if (list) vernacular = new Map(list.map((b) => [b.code, b.name]))
  }
  const books: PickerBook[] = staticBooks.map((b) => ({
    code: b.code,
    name: vernacular?.get(b.code) ?? b.name,
    section: sectionOf(b.code),
    testament: testamentOf(b.code),
    chapters: b.chapters,
  }))
  // Preserve canonical order; group by first-seen section.
  const order: string[] = []
  const map = new Map<string, PickerBook[]>()
  for (const b of books) {
    if (!map.has(b.section)) { map.set(b.section, []); order.push(b.section) }
    map.get(b.section)!.push(b)
  }
  return order.map((section) => ({ section, books: map.get(section)! }))
}

export function BiblePickerSheet() {
  const storeIso = useStore($selectedIso)
  const [open, setOpen] = useState(false)
  const [groups, setGroups] = useState<Group[]>([])
  const [openBook, setOpenBook] = useState<string | null>(null)
  const [current, setCurrent] = useState<{ book: string; chapter: number } | null>(null)
  const loadedForIso = useRef<string>("")

  const iso = storeIso || "eng"
  const lang: "en" | "es" = iso === "eng" ? "en" : "es"

  useEffect(() => {
    initIsoFromUrl()
  }, [])

  const ensureBooks = useCallback(
    async (forIso: string) => {
      if (loadedForIso.current === forIso && groups.length) return
      loadedForIso.current = forIso
      const g = await loadPickerBooks(forIso)
      setGroups(g)
    },
    [groups.length],
  )

  useEffect(() => {
    const onOpen = (e: Event) => {
      const detail = (e as CustomEvent).detail
      const forIso: string = detail?.iso || $selectedIso.get() || "eng"
      const pos = savedPosition()
      setCurrent(pos)
      setOpenBook(pos?.book ?? null)
      setOpen(true)
      ensureBooks(forIso)
      // No prior position → land on the language's start-at-reference (spec §6.3).
      if (!pos) {
        loadAppConfig(forIso).then((cfg) => {
          const sr = parseStartRef(cfg?.features?.["start-at-reference"])
          if (sr) { setCurrent(sr); setOpenBook(sr.book) }
        })
      }
    }
    window.addEventListener("open-bible-picker", onOpen)
    return () => window.removeEventListener("open-bible-picker", onOpen)
  }, [ensureBooks])

  // Close on Escape.
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false) }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [open])

  function selectChapter(book: string, chapter: number) {
    try { localStorage.setItem(POS_KEY, JSON.stringify({ book, chapter })) } catch {}
    showBible()
    window.dispatchEvent(new CustomEvent("navigate-to-chapter", { detail: { book, chapter } }))
    setOpen(false)
  }

  if (!open) return null

  const title = t(lang, "biblePicker.title")
  const closeLabel = t(lang, "biblePicker.close")

  return (
    <div className="bible-picker-backdrop" onClick={() => setOpen(false)}>
      <div
        className="bible-picker-sheet"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="bible-picker-header">
          <h2 className="bible-picker-title">{title}</h2>
          <button
            className="bible-picker-close"
            type="button"
            aria-label={closeLabel}
            onClick={() => setOpen(false)}
          >
            ✕
          </button>
        </div>

        <div className="bible-picker-body">
          {groups.length === 0 && (
            <p className="bible-picker-empty">{t(lang, "biblePicker.loading")}</p>
          )}
          {groups.map((g) => (
            <section key={g.section} className="bible-picker-group">
              <h3 className="bible-picker-section">{sectionLabel(g.section, lang)}</h3>
              <ul className="bible-picker-books">
                {g.books.map((b) => {
                  const isOpen = openBook === b.code
                  const isCurrent = current?.book === b.code
                  return (
                    <li key={b.code}>
                      <button
                        type="button"
                        className={`bible-picker-book ${isOpen ? "open" : ""} ${isCurrent ? "current" : ""}`}
                        onClick={() => setOpenBook(isOpen ? null : b.code)}
                        aria-expanded={isOpen}
                      >
                        <span className="bible-picker-book-name">{b.name}</span>
                        <span className={`bible-picker-chevron ${isOpen ? "open" : ""}`}>›</span>
                      </button>
                      {isOpen && (
                        <div className="bible-picker-chapters">
                          {Array.from({ length: b.chapters }, (_, i) => i + 1).map((ch) => {
                            const active = isCurrent && current?.chapter === ch
                            return (
                              <button
                                key={ch}
                                type="button"
                                className={`bible-picker-chapter ${active ? "active" : ""}`}
                                onClick={() => selectChapter(b.code, ch)}
                              >
                                {ch}
                              </button>
                            )
                          })}
                        </div>
                      )}
                    </li>
                  )
                })}
              </ul>
            </section>
          ))}
        </div>
      </div>
    </div>
  )
}
