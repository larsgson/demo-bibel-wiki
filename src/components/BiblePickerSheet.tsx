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
import { pkfUrl } from "../lib/bw/pkf-url"
import "../styles/bible-picker.css"

/**
 * sab-pwa-style book/chapter picker: a compact panel anchored under the
 * triggering element (the reader title / landing button), with Book /
 * Chapter / Verse TABS that auto-advance — selecting a book switches the
 * active tab to Chapter in place (and Chapter to Verse), rather than
 * expanding an accordion. Matches example/sab-pwa's BookSelector/
 * ChapterSelector + TabsMenu + SelectGrid pattern.
 *
 * Opened from a reader's title via the global `open-bible-picker` event,
 * whose detail carries `anchorRect` (the trigger's getBoundingClientRect())
 * so the panel opens right under it, like a native dropdown.
 *
 * Book data comes from `app-config.books[]` for PKF/vernacular languages (spec
 * §6.4 — localised names + sections + chapter counts, no `.pkf` load needed),
 * and falls back to the static 66-book table (+ helloao vernacular names) for
 * English/BSB and Spanish/DBT, which are not on this CDN.
 *
 * Verse numbers come from the catalog's `versesByChapters` (both the PKF
 * catalog and the BSB catalog carry this) — the same file ReaderLoader
 * already resolves a URL for. Languages with neither (Spanish/DBT bridge
 * languages) simply have no Verse tab, degrading the same way sab-pwa itself
 * skips the tab when `verseCount === 0`.
 */

const POS_KEY = "bw-last-position"
// Narrower when the Book tab is suppressed (Chapter-trigger flow — no book
// abbreviations to fit), matching sab-pwa's Dropdown min-w-[22rem]/[18rem]
// split between its 6-col (book) and 5-col (chapter/verse) variants.
const PANEL_WIDTH = 340
const PANEL_WIDTH_NARROW = 260

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

/** bookCode -> chapter -> verse-number keys (from versesByChapters). */
type VerseData = Map<string, Record<string, Record<string, string>>>

async function loadVerseData(iso: string): Promise<VerseData | null> {
  try {
    let catalogUrl: string | null = null
    if (iso === "eng") {
      catalogUrl = "/bsb/catalog.json"
    } else {
      const infoRes = await fetch(pkfUrl(`/pkf/${iso}/info.json`))
      if (!infoRes.ok) return null
      const info = await infoRes.json()
      const pkfAsset = info.assets?.find((a: any) => a.kind === "pkf")
      const catalogAsset = pkfAsset
        ? info.assets?.find((a: any) => a.kind === "json" && a.base === pkfAsset.base)
        : null
      if (!catalogAsset) return null
      catalogUrl = pkfUrl(`/pkf/${iso}/${catalogAsset.name}`)
    }
    const catRes = await fetch(catalogUrl)
    if (!catRes.ok) return null
    const catalog = await catRes.json()
    const map: VerseData = new Map()
    for (const doc of catalog.documents ?? []) {
      if (doc.bookCode && doc.versesByChapters) map.set(doc.bookCode, doc.versesByChapters)
    }
    return map
  } catch {
    return null
  }
}

type Tab = "book" | "chapter" | "verse"

export function BiblePickerSheet() {
  const storeIso = useStore($selectedIso)
  const [open, setOpen] = useState(false)
  const [anchorRect, setAnchorRect] = useState<DOMRect | null>(null)
  const [groups, setGroups] = useState<Group[]>([])
  const [verseData, setVerseData] = useState<VerseData | null>(null)
  const [tab, setTab] = useState<Tab>("book")
  // Chapter-trigger flow (sab-pwa's ChapterSelector) never offers a Book tab
  // — only Chapter/Verse. Book-trigger flow (BookSelector) offers all three.
  const [allowBookTab, setAllowBookTab] = useState(true)
  const [pickedBook, setPickedBook] = useState<string | null>(null)
  const [pickedChapter, setPickedChapter] = useState<number | null>(null)
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
      const [g, v] = await Promise.all([loadPickerBooks(forIso), loadVerseData(forIso)])
      setGroups(g)
      setVerseData(v)
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
      setPickedChapter(null)
      // The topbar has separate Book/Chapter triggers (sab-pwa pattern) —
      // land straight on the requested tab, and suppress the Book tab
      // entirely for the Chapter-trigger flow. Falls back to "book" when
      // there's no saved position yet, since a chapter grid needs a book.
      const wantsChapter = detail?.initialTab === "chapter"
      setTab(wantsChapter && pos ? "chapter" : "book")
      setAllowBookTab(!wantsChapter)
      setAnchorRect(detail?.anchorRect ?? null)
      setOpen(true)
      ensureBooks(forIso)
      // No prior position → land on the language's start-at-reference (spec §6.3).
      if (!pos) {
        loadAppConfig(forIso).then((cfg) => {
          const sr = parseStartRef(cfg?.features?.["start-at-reference"])
          if (sr) {
            setCurrent(sr)
            setPickedBook(sr.book)
            if (detail?.initialTab === "chapter") setTab("chapter")
          }
        })
      }
    }
    window.addEventListener("open-bible-picker", onOpen)
    return () => window.removeEventListener("open-bible-picker", onOpen)
  }, [ensureBooks])

  // Close on Escape. Outside-click-to-close is handled by the scrim's own
  // onClick (below) + stopPropagation on the panel — simpler and more
  // reliable than a document-level listener racing React's event handling.
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false) }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [open])

  function chooseBook(code: string) {
    setPickedBook(code)
    setPickedChapter(null)
    setTab("chapter")
  }

  function goToChapter(book: string, chapter: number, highlightVerses?: number[]) {
    try { localStorage.setItem(POS_KEY, JSON.stringify({ book, chapter })) } catch {}
    showBible()
    window.dispatchEvent(new CustomEvent("navigate-to-chapter", { detail: { book, chapter, highlightVerses } }))
    setOpen(false)
  }

  function selectChapter(book: string, chapter: number) {
    const verseKeys = verseData?.get(book)?.[String(chapter)]
    const verseCount = verseKeys ? Object.keys(verseKeys).length : 0
    if (verseCount > 1) {
      setPickedChapter(chapter)
      setTab("verse")
    } else {
      goToChapter(book, chapter)
    }
  }

  function selectVerse(book: string, chapter: number, verse: number) {
    goToChapter(book, chapter, [verse])
  }

  if (!open) return null

  const bookLabel = t(lang, "biblePicker.bookTab")
  const chapterLabel = t(lang, "biblePicker.chapterTab")
  const verseLabel = t(lang, "biblePicker.verseTab")
  const pickedBookEntry = groups.flatMap((g) => g.books).find((b) => b.code === pickedBook) ?? null
  const verseKeys = pickedBook && pickedChapter
    ? verseData?.get(pickedBook)?.[String(pickedChapter)]
    : undefined
  const verseNumbers = verseKeys
    ? Object.keys(verseKeys).map(Number).sort((a, b) => a - b)
    : []

  // Anchored position, clamped to the viewport; falls back to a centered
  // top panel when no trigger rect is available.
  const panelWidth = allowBookTab ? PANEL_WIDTH : PANEL_WIDTH_NARROW
  const style: React.CSSProperties = anchorRect
    ? {
        position: "fixed",
        top: Math.min(anchorRect.bottom + 8, window.innerHeight - 120),
        left: Math.max(8, Math.min(anchorRect.left, window.innerWidth - panelWidth - 8)),
        width: `min(${panelWidth}px, calc(100vw - 1rem))`,
      }
    : { position: "fixed", top: 64, left: "50%", transform: "translateX(-50%)" }

  return (
    <div className="bible-picker-scrim" onClick={() => setOpen(false)}>
      <div
        className="bible-picker-panel"
        style={style}
        role="dialog"
        aria-modal="true"
        aria-label={t(lang, "biblePicker.title")}
        ref={panelRef}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="bible-picker-tabs">
          {allowBookTab && (
            <button
              type="button"
              className={`bible-picker-tab ${tab === "book" ? "active" : ""}`}
              onClick={() => setTab("book")}
            >
              {pickedBookEntry ? pickedBookEntry.name : bookLabel}
            </button>
          )}
          {pickedBook && (
            <button
              type="button"
              className={`bible-picker-tab ${tab === "chapter" ? "active" : ""}`}
              onClick={() => setTab("chapter")}
            >
              {chapterLabel}
            </button>
          )}
          {pickedChapter && verseNumbers.length > 0 && (
            <button
              type="button"
              className={`bible-picker-tab ${tab === "verse" ? "active" : ""}`}
              onClick={() => setTab("verse")}
            >
              {verseLabel}
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

          {tab === "verse" && pickedBook && pickedChapter && (
            <div className="bible-picker-grid bible-picker-grid-verses">
              <button
                type="button"
                className="bible-picker-cell bible-picker-cell-wide"
                onClick={() => goToChapter(pickedBook, pickedChapter)}
              >
                {t(lang, "biblePicker.wholeChapter")}
              </button>
              {verseNumbers.map((v) => (
                <button
                  key={v}
                  type="button"
                  className="bible-picker-cell"
                  onClick={() => selectVerse(pickedBook, pickedChapter, v)}
                >
                  {v}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
