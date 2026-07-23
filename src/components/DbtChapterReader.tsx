import { useState, useEffect, useMemo } from "react"
import { loadChapter } from "../stores/chapter-store"
import { resolveTextSource } from "../lib/bw/source-catalog"
import { getTestament } from "../lib/bw/bible-utils"
import { loadBookList } from "../lib/bw/book-list"
import { t } from "../lib/bw/ui-locales"
import { $activePane } from "../stores/branch-view-store"
import books from "../lib/bw/bible-books"
import "../styles/dbt-reader.css"

interface Verse { num: number; text: string }

/**
 * Full-chapter Bible reader for non-.pkf languages (Spanish, other bridge/trade
 * languages). Reuses chapter-store.loadChapter (contrib → helloao → DBT), the
 * same path the story reader already uses for verse text — so anything that
 * works in stories works here, with simple book + chapter navigation.
 *
 * Text fileset resolution goes through source-catalog.ts (the build-time-
 * baked cdn.bibel.wiki text-provider catalog) — NOT loadLanguageData()
 * (stores/language-store.ts), which reads the STORY-content manifest
 * (public/ALL-langs-data/manifest.json, from bible-story-builder). That
 * manifest only covers languages with OBS/TGS/John story content, a
 * different and much narrower set than "has real Bible text" — gating this
 * reader on it meant languages with real DBT/helloAO text but no story
 * content (most of config/regions/ke.toml's, for one) showed "no data" even
 * though chapter-store.loadChapter could actually fetch their text fine.
 */
const POS_KEY = "bw-last-position"

function savedPosition(): { book: string; chapter: number } | null {
  try {
    const raw = localStorage.getItem(POS_KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

export function DbtChapterReader({ iso, lang = "en" }: { iso: string; lang?: string }) {
  const [filesets, setFilesets] = useState<{ nt: string; ot: string } | null>(null)
  const [canon, setCanon] = useState<"nt" | "ot" | "full">("full")
  const [bookCode, setBookCode] = useState(() => savedPosition()?.book || "JHN")
  const [chapter, setChapter] = useState(() => savedPosition()?.chapter || 1)
  const [verses, setVerses] = useState<Verse[] | null>(null)
  const [status, setStatus] = useState<"loading" | "ready" | "unavailable" | "nodata">("loading")
  const [paneVisible, setPaneVisible] = useState(false)
  const [vernacular, setVernacular] = useState<Map<string, string>>(new Map())

  // Bible pane is Standard/Study only; show when the pane is "bible".
  useEffect(() => {
    const bibleAllowed = () => {
      const l = localStorage.getItem("bw-ui-level")
      return l === "2" || l === "3"
    }
    setPaneVisible(bibleAllowed() && $activePane.get().pane === "bible")
    const onPane = (e: Event) =>
      setPaneVisible(bibleAllowed() && (e as CustomEvent).detail?.pane === "bible")
    const onLevel = () => { if (!bibleAllowed()) setPaneVisible(false) }
    window.addEventListener("pane-changed", onPane)
    window.addEventListener("ui-level-changed", onLevel)
    return () => {
      window.removeEventListener("pane-changed", onPane)
      window.removeEventListener("ui-level-changed", onLevel)
    }
  }, [])

  // Resolve the text fileset(s) for the language once, via the build-time
  // text-source catalog (see the file header for why not loadLanguageData()).
  useEffect(() => {
    let alive = true
    Promise.all([resolveTextSource(iso, "nt"), resolveTextSource(iso, "ot")]).then(([nt, ot]) => {
      if (!alive) return
      // chapter-store.loadChapter's filesetId convention: "helloao:<id>" for
      // helloAO, the raw DBT abbreviation for dbt. pkf never reaches this
      // component (ReaderLoader routes pkf languages to Reader.svelte
      // instead), and has no fileset id to give here anyway.
      const fsId = (r: typeof nt) => {
        if (!r || !r.id) return null
        return r.provider === "helloao" ? `helloao:${r.id}` : r.id
      }
      const ntId = fsId(nt)
      const otId = fsId(ot)
      if (!ntId && !otId) { setStatus("nodata"); return }
      setFilesets({ nt: ntId ?? "", ot: otId ?? "" })
      setCanon(ntId && otId ? "full" : ntId ? "nt" : "ot")
    })
    loadBookList(iso).then((list) => {
      if (alive && list) setVernacular(new Map(list.map((b) => [b.code, b.name])))
    })
    return () => { alive = false }
  }, [iso])

  // Book + chapter navigation is driven by the left-pane Bible tree, which
  // dispatches navigate-to-chapter (the same event the .pkf reader listens to).
  useEffect(() => {
    const onNav = (e: Event) => {
      const d = (e as CustomEvent).detail
      if (d?.book) { setBookCode(d.book); setChapter(d.chapter ?? 1) }
    }
    window.addEventListener("navigate-to-chapter", onNav)
    return () => window.removeEventListener("navigate-to-chapter", onNav)
  }, [])

  // Persist position + tell the sidebar which chapter is active.
  useEffect(() => {
    try { localStorage.setItem(POS_KEY, JSON.stringify({ book: bookCode, chapter })) } catch {}
    window.dispatchEvent(new CustomEvent("bible-position-changed", { detail: { book: bookCode, chapter } }))
  }, [bookCode, chapter])

  const currentBook = useMemo(() => books.find((b) => b.code === bookCode), [bookCode])

  // Load the chapter when book/chapter/filesets change.
  useEffect(() => {
    if (!filesets || !currentBook) return
    let alive = true
    setStatus("loading"); setVerses(null)
    const testament = getTestament(bookCode)
    const fsId = testament === "ot" ? (filesets.ot || filesets.nt) : (filesets.nt || filesets.ot)
    loadChapter(bookCode, chapter, fsId, iso)
      .then((v: any) => {
        if (!alive) return
        if (Array.isArray(v) && v.length) { setVerses(v); setStatus("ready") }
        else setStatus("unavailable")
      })
      .catch(() => { if (alive) setStatus("unavailable") })
    return () => { alive = false }
  }, [filesets, bookCode, chapter, iso, currentBook])

  const bookName = vernacular.get(bookCode) || currentBook?.name || bookCode
  const maxChapter = currentBook?.chapters ?? 1
  const tr = (k: string) => t(lang, `reader.${k}`)

  return (
    <div className="dbt-reader" style={{ display: paneVisible ? "" : "none" }}>
      <div className="dbt-reader-body">
        <div className="dbt-reader-titlebar">
          <button
            type="button"
            className="dbt-reader-title dbt-reader-title-btn"
            onClick={(e) => window.dispatchEvent(new CustomEvent("open-bible-picker", { detail: { iso, anchorRect: e.currentTarget.getBoundingClientRect() } }))}
            title={tr("chooseBookChapter")}
          >
            {bookName} {chapter} <span className="dbt-reader-title-caret">▾</span>
          </button>
          <div className="dbt-chapter-nav">
            <button type="button" disabled={chapter <= 1} onClick={() => setChapter((c) => Math.max(1, c - 1))} aria-label={tr("prevChapter")}>‹</button>
            <button type="button" disabled={chapter >= maxChapter} onClick={() => setChapter((c) => Math.min(maxChapter, c + 1))} aria-label={tr("nextChapter")}>›</button>
          </div>
        </div>
        {status === "loading" && <p className="dbt-reader-note">{tr("loading")}</p>}
        {status === "nodata" && <p className="dbt-reader-note">{tr("noLanguageData")}</p>}
        {status === "unavailable" && <p className="dbt-reader-note">{tr("chapterUnavailable")}</p>}
        {status === "ready" && verses && (
          <p className="dbt-reader-text">
            {verses.map((v) => (
              <span key={v.num} className="dbt-verse">
                <sup className="dbt-verse-num">{v.num}</sup>
                {v.text}{" "}
              </span>
            ))}
          </p>
        )}
      </div>
    </div>
  )
}
