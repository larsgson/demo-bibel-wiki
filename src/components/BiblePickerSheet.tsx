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
 * sab-pwa-style book/chapter picker: a compact panel anchored under the
 * triggering element (the reader title / landing button), with Book and
 * Chapter TABS that auto-advance — selecting a book switches the active tab
 * to Chapter in place, rather than expanding an accordion. Matches
 * example/sab-pwa's BookSelector/ChapterSelector + TabsMenu + SelectGrid
 * pattern (see internal notes); verse-level selection is not implemented yet
 * (sab-pwa also has a Verse tab — deferred, not required for this pass).
 *
 * Opened from a reader's title via the global `open-bible-picker` event,
 * whose detail carries `anchorRect` (the trigger's getBoundingClientRect())
 * so the panel opens right under it, like a native dropdown.
 *
 * Book data comes from `app-config.books[]` for PKF/vernacular languages (spec
 * §6.4 — localised names + sections + chapter counts, no `.pkf` load needed),
 * and falls back to the static 66-book table (+ helloao vernacular names) for
 * English/BSB and Spanish/DBT, which are not on this CDN.
 */

const POS_KEY = "bw-last-position"
const PANEL_WIDTH = 360

interface PickerBook {
  code: string
  name: string
  abbreviation: string
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
        abbreviation: b.abbreviation || b.name.slice(0, 4),
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
    abbreviation: b.abbrev,
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

type Tab = "book" | "chapter"

export function BiblePickerSheet() {
  const storeIso = useStore($selectedIso)
  const [open, setOpen] = useState(false)
  const [anchorRect, setAnchorRect] = useState<DOMRect | null>(null)
  const [groups, setGroups] = useState<Group[]>([])
  const [tab, setTab] = useState<Tab>("book")
  const [pickedBook, setPickedBook] = useState<string | null>(null)
  const [current, setCurrent] = useState<{ book: string; chapter: number } | null>(null)
  const loadedForIso = useRef<string>("")
  const panelRef = useRef<HTMLDivElement>(null)

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
      setPickedBook(pos?.book ?? null)
      setTab("book")
      setAnchorRect(detail?.anchorRect ?? null)
      setOpen(true)
      ensureBooks(forIso)
      // No prior position → land on the language's start-at-reference (spec §6.3).
      if (!pos) {
        loadAppConfig(forIso).then((cfg) => {
          const sr = parseStartRef(cfg?.features?.["start-at-reference"])
          if (sr) { setCurrent(sr); setPickedBook(sr.book) }
        })
      }
    }
    window.addEventListener("open-bible-picker", onOpen)
    return () => window.removeEventListener("open-bible-picker", onOpen)
  }, [ensureBooks])

  // Close on Escape or an outside click (native-dropdown behavior).
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false) }
    const onClick = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) setOpen(false)
    }
    window.addEventListener("keydown", onKey)
    // Deferred so the opening click itself doesn't immediately close it.
    const id = setTimeout(() => document.addEventListener("click", onClick), 0)
    return () => {
      window.removeEventListener("keydown", onKey)
      clearTimeout(id)
      document.removeEventListener("click", onClick)
    }
  }, [open])

  function chooseBook(code: string) {
    setPickedBook(code)
    setTab("chapter")
  }

  function selectChapter(book: string, chapter: number) {
    try { localStorage.setItem(POS_KEY, JSON.stringify({ book, chapter })) } catch {}
    showBible()
    window.dispatchEvent(new CustomEvent("navigate-to-chapter", { detail: { book, chapter } }))
    setOpen(false)
  }

  if (!open) return null

  const bookLabel = t(lang, "biblePicker.bookTab")
  const chapterLabel = t(lang, "biblePicker.chapterTab")
  const pickedBookEntry = groups.flatMap((g) => g.books).find((b) => b.code === pickedBook) ?? null

  // Anchored position, clamped to the viewport; falls back to a centered
  // top panel when no trigger rect is available.
  const style: React.CSSProperties = anchorRect
    ? {
        position: "fixed",
        top: Math.min(anchorRect.bottom + 8, window.innerHeight - 120),
        left: Math.max(8, Math.min(anchorRect.left, window.innerWidth - PANEL_WIDTH - 8)),
      }
    : { position: "fixed", top: 64, left: "50%", transform: "translateX(-50%)" }

  return (
    <div className="bible-picker-scrim">
      <div
        className="bible-picker-panel"
        style={style}
        role="dialog"
        aria-modal="true"
        aria-label={t(lang, "biblePicker.title")}
        ref={panelRef}
      >
        <div className="bible-picker-tabs">
          <button
            type="button"
            className={`bible-picker-tab ${tab === "book" ? "active" : ""}`}
            onClick={() => setTab("book")}
          >
            {pickedBookEntry ? pickedBookEntry.name : bookLabel}
          </button>
          {pickedBook && (
            <button
              type="button"
              className={`bible-picker-tab ${tab === "chapter" ? "active" : ""}`}
              onClick={() => setTab("chapter")}
            >
              {chapterLabel}
            </button>
          )}
        </div>

        <div className="bible-picker-body">
          {groups.length === 0 && (
            <p className="bible-picker-empty">{t(lang, "biblePicker.loading")}</p>
          )}

          {tab === "book" && groups.map((g) => (
            <section key={g.section} className="bible-picker-group">
              <h3 className="bible-picker-section">{sectionLabel(g.section, lang)}</h3>
              <div className="bible-picker-grid">
                {g.books.map((b) => (
                  <button
                    key={b.code}
                    type="button"
                    title={b.name}
                    className={`bible-picker-cell ${current?.book === b.code ? "current" : ""}`}
                    onClick={() => chooseBook(b.code)}
                  >
                    {b.abbreviation}
                  </button>
                ))}
              </div>
            </section>
          ))}

          {tab === "chapter" && pickedBookEntry && (
            <div className="bible-picker-grid bible-picker-grid-chapters">
              {Array.from({ length: pickedBookEntry.chapters }, (_, i) => i + 1).map((ch) => {
                const active = current?.book === pickedBook && current?.chapter === ch
                return (
                  <button
                    key={ch}
                    type="button"
                    className={`bible-picker-cell ${active ? "active" : ""}`}
                    onClick={() => selectChapter(pickedBookEntry.code, ch)}
                  >
                    {ch}
                  </button>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
