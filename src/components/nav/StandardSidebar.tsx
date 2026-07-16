import { useEffect, useState } from "react"
import { useStore } from "@nanostores/react"
import { $selectedIso } from "../../stores/iso-store"
import { $activePane, showBible, showSearch } from "../../stores/branch-view-store"
import { t as translate } from "../../lib/bw/ui-locales"
import { loadAppConfig, type AppConfig } from "../../lib/data/app-config"
import { uiLangForRegion } from "../../lib/data/region-config"
import { $activeRegion } from "../../stores/region-store"
import { shareCurrentPage } from "../../lib/bw/share"
import { currentBookmarkKey, isBookmarked } from "../../lib/bw/bookmarks"

/**
 * Standard-mode left navigation drawer — a flat menu list modelled directly
 * on sab-pwa's Sidebar.svelte (header + `<ul>` of icon+label buttons sliding
 * in from the left over a backdrop), not the hierarchical book/story tree of
 * AppSidebar.tsx. That tree is Study-mode (level 3) only; this is Standard
 * (level 2) only — see sidebar.css's `data-ui-level` gating. Both share the
 * same reader-topbar hamburger, which dispatches the right toggle event for
 * whichever level is active (Reader.svelte's openSidebar()).
 *
 * Matches the full sab-pwa menu (icons + item order/grouping) minus the
 * items this app has no working destination for — sab-pwa's Firebase-only
 * features (Account, History, Notes, Highlights-as-a-tool, Reading Plans,
 * a Language/Layout collection switcher, custom menuItems) are omitted
 * rather than linked to nowhere. Bookmarks and About ARE real here (this
 * app already saves bookmarks and loads app-config/copyright), just
 * rendered as an inline expandable section instead of a separate page,
 * since this app has no per-feature routing to send them to.
 */

type IconDef = { viewBox: string; path: string }
const ICONS: Record<string, IconDef> = {
  home: { viewBox: "0 0 24 24", path: "M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z" },
  search: {
    viewBox: "0 0 24 24",
    path:
      "m19.6 21-6.3-6.3q-.75.6-1.725.95Q10.6 16 9.5 16q-2.725 0-4.612-1.887Q3 12.225 3 9.5q0-2.725 1.888-4.613Q6.775 3 9.5 3t4.613 1.887Q16 6.775 16 9.5q0 1.1-.35 2.075-.35.975-.95 1.725l6.3 6.3ZM9.5 14q1.875 0 3.188-1.312Q14 11.375 14 9.5q0-1.875-1.312-3.188Q11.375 5 9.5 5 7.625 5 6.312 6.312 5 7.625 5 9.5q0 1.875 1.312 3.188Q7.625 14 9.5 14Z",
  },
  bookmark: {
    viewBox: "0 0 24 24",
    path: "M5 21V5q0-.825.588-1.413Q6.175 3 7 3h10q.825 0 1.413.587Q19 4.175 19 5v16l-7-3Z",
  },
  settings: {
    viewBox: "0 0 24 24",
    path:
      "m9.25 22-.4-3.2q-.325-.125-.612-.3-.288-.175-.563-.375L4.7 19.375l-2.75-4.75 2.575-1.95Q4.5 12.5 4.5 12.337v-.675q0-.162.025-.337L1.95 9.375l2.75-4.75 2.975 1.25q.275-.2.575-.375.3-.175.6-.3l.4-3.2h5.5l.4 3.2q.325.125.613.3.287.175.562.375l2.975-1.25 2.75 4.75-2.575 1.95q.025.175.025.337v.675q0 .163-.05.338l2.575 1.95-2.75 4.75-2.95-1.25q-.275.2-.575.375-.3.175-.6.3l-.4 3.2Zm2.8-6.5q1.45 0 2.475-1.025Q15.55 13.45 15.55 12q0-1.45-1.025-2.475Q13.5 8.5 12.05 8.5q-1.475 0-2.488 1.025Q8.55 10.55 8.55 12q0 1.45 1.012 2.475Q10.575 15.5 12.05 15.5Z",
  },
  textAppearance: {
    viewBox: "0 0 15.24 15.24",
    path:
      "M 5.868047,8.2723157 C 5.6387459,8.8545984 5.1837812,10.022093 4.982454,10.547663 l -2.4158346,0.02059 -0.5109765,1.493243 H 0.13576 L 2.8642756,4.674661 H 5.05701 Z M 4.8436898,9.2139188 3.9358382,6.5647783 3.0279866,9.2139188 Z M 15.073332,12.052526 H 12.447339 L 11.766036,10.061534 H 8.1147819 L 7.4334791,12.052526 H 4.8736328 L 8.5116573,2.203401 h 2.9236487 z m -3.922453,-3.7967751 -1.2104703,-3.532191 -1.21047,3.532191 z",
  },
  about: {
    viewBox: "0 0 24 24",
    path:
      "M11 17h2v-6h-2Zm1-8q.425 0 .713-.288Q13 8.425 13 8t-.287-.713Q12.425 7 12 7t-.712.287Q11 7.575 11 8t.288.712Q11.575 9 12 9Zm0 13q-2.075 0-3.9-.788-1.825-.787-3.175-2.137-1.35-1.35-2.137-3.175Q2 14.075 2 12t.788-3.9q.787-1.825 2.137-3.175 1.35-1.35 3.175-2.138Q9.925 2 12 2t3.9.787q1.825.788 3.175 2.138 1.35 1.35 2.137 3.175Q22 9.925 22 12t-.788 3.9q-.787 1.825-2.137 3.175-1.35 1.35-3.175 2.137Q14.075 22 12 22Z",
  },
  share: {
    viewBox: "0 0 24 24",
    path:
      "M18 16.08c-.76 0-1.44.3-1.96.77L8.91 12.7c.05-.23.09-.46.09-.7s-.04-.47-.09-.7l7.05-4.11c.54.5 1.25.81 2.04.81 1.66 0 3-1.34 3-3s-1.34-3-3-3-3 1.34-3 3c0 .24.04.47.09.7L8.04 9.81C7.5 9.31 6.79 9 6 9c-1.66 0-3 1.34-3 3s1.34 3 3 3c.79 0 1.5-.31 2.04-.81l7.12 4.16c-.05.21-.08.43-.08.65 0 1.61 1.31 2.92 2.92 2.92 1.61 0 2.92-1.31 2.92-2.92s-1.31-2.92-2.92-2.92z",
  },
}

function Icon({ name }: { name: keyof typeof ICONS }) {
  const i = ICONS[name]
  return (
    <svg className="standard-sidebar-icon" viewBox={i.viewBox} width="22" height="22" aria-hidden="true">
      <path d={i.path} fill="currentColor" />
    </svg>
  )
}

const BOOKMARKS_KEY = "bw-bookmarks"

function loadBookmarksForIso(iso: string): { book: string; chapter: number }[] {
  try {
    const raw = localStorage.getItem(BOOKMARKS_KEY)
    if (!raw) return []
    const keys: string[] = JSON.parse(raw)
    return keys
      .filter((k) => k.startsWith(`${iso}/`))
      .map((k) => {
        const [, book, chapter] = k.split("/")
        return { book, chapter: parseInt(chapter, 10) }
      })
      .filter((b) => b.book && Number.isFinite(b.chapter))
  } catch {
    return []
  }
}

export function StandardSidebar() {
  const [isOpen, setIsOpen] = useState(false)
  const storeIso = useStore($selectedIso)
  const [pane, setPane] = useState(() => $activePane.get().pane)
  const [bookmarksOpen, setBookmarksOpen] = useState(false)
  const [aboutOpen, setAboutOpen] = useState(false)
  const [appCfg, setAppCfg] = useState<AppConfig | null>(null)
  const [shared, setShared] = useState(false)
  const [currentBookmarked, setCurrentBookmarked] = useState(false)

  const iso = storeIso || "eng"
  // UI chrome language follows the region's own configured language, not
  // the content language being read — the CDN has no per-vernacular UI
  // translations to fall back to (see AppSidebar.tsx for the full note).
  const lang = uiLangForRegion($activeRegion.get())
  const tr = (k: string) => translate(lang, `nav.${k}`)

  useEffect(() => {
    const onToggle = () => setIsOpen((v) => !v)
    window.addEventListener("toggle-standard-sidebar", onToggle)
    return () => window.removeEventListener("toggle-standard-sidebar", onToggle)
  }, [])

  useEffect(() => {
    const onPaneChanged = (e: Event) => setPane((e as CustomEvent).detail?.pane)
    window.addEventListener("pane-changed", onPaneChanged)
    return () => window.removeEventListener("pane-changed", onPaneChanged)
  }, [])

  useEffect(() => {
    document.body.classList.toggle("standard-sidebar-open", isOpen)
    window.dispatchEvent(new CustomEvent("standard-sidebar-state-changed", { detail: { isOpen } }))
  }, [isOpen])

  useEffect(() => {
    if (!isOpen) return
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setIsOpen(false) }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [isOpen])

  useEffect(() => {
    if (aboutOpen && !appCfg) loadAppConfig(iso).then(setAppCfg)
  }, [aboutOpen, appCfg, iso])

  // Track whether the currently-open chapter is bookmarked — Reader.svelte
  // owns the actual toggle/storage, this just mirrors it (see bookmarks.ts).
  useEffect(() => {
    const refresh = () => setCurrentBookmarked(isBookmarked(currentBookmarkKey(iso)))
    refresh()
    window.addEventListener("bookmark-state-changed", refresh)
    window.addEventListener("bible-position-changed", refresh)
    return () => {
      window.removeEventListener("bookmark-state-changed", refresh)
      window.removeEventListener("bible-position-changed", refresh)
    }
  }, [iso])

  function close() {
    setIsOpen(false)
    setBookmarksOpen(false)
    setAboutOpen(false)
  }

  function goToBookmark(book: string, chapter: number) {
    showBible()
    window.dispatchEvent(new CustomEvent("navigate-to-chapter", { detail: { book, chapter } }))
    close()
  }

  function toggleCurrentBookmark() {
    window.dispatchEvent(new CustomEvent("toggle-bookmark"))
    setCurrentBookmarked((v) => !v)
  }

  async function share() {
    const ok = await shareCurrentPage()
    if (ok) {
      setShared(true)
      setTimeout(() => setShared(false), 1400)
    }
  }

  const bookmarks = bookmarksOpen ? loadBookmarksForIso(iso) : []

  return (
    <>
      {isOpen && (
        <button
          className="standard-sidebar-backdrop"
          type="button"
          aria-label={tr("closeMenu")}
          onClick={close}
        />
      )}

      <aside className={`standard-sidebar ${isOpen ? "open" : ""}`} aria-label={tr("navigation")}>
        <div className="standard-sidebar-header">
          <span className="standard-sidebar-heading">{tr("navigation")}</span>
          <button
            className="standard-sidebar-close"
            type="button"
            aria-label={tr("closeMenu")}
            onClick={close}
          >
            ✕
          </button>
        </div>

        <ul className="standard-sidebar-menu">
          <li>
            <a href="/">
              <Icon name="home" /> {tr("home")}
            </a>
          </li>
          <li>
            <button
              type="button"
              className={pane === "search" ? "active" : ""}
              onClick={() => { showSearch(); close() }}
            >
              <Icon name="search" /> {tr("search")}
            </button>
          </li>
          <li>
            <button type="button" onClick={share}>
              <Icon name="share" /> {shared ? translate(lang, "reader.linkCopied") : translate(lang, "reader.shareLink")}
            </button>
          </li>
        </ul>
        <div className="standard-sidebar-divider" />

        <ul className="standard-sidebar-menu">
          <li>
            <button type="button" className={currentBookmarked ? "active" : ""} onClick={toggleCurrentBookmark}>
              <Icon name="bookmark" />
              {currentBookmarked ? translate(lang, "reader.removeBookmark") : translate(lang, "reader.bookmark")}
            </button>
          </li>
          <li>
            <button
              type="button"
              className={bookmarksOpen ? "active" : ""}
              onClick={() => setBookmarksOpen((v) => !v)}
            >
              <Icon name="bookmark" /> {tr("bookmarks")}
            </button>
            {bookmarksOpen && (
              <ul className="standard-sidebar-sublist">
                {bookmarks.length === 0 ? (
                  <li className="standard-sidebar-empty">{tr("noBookmarks")}</li>
                ) : (
                  bookmarks.map((b) => (
                    <li key={`${b.book}/${b.chapter}`}>
                      <button type="button" onClick={() => goToBookmark(b.book, b.chapter)}>
                        {b.book} {b.chapter}
                      </button>
                    </li>
                  ))
                )}
              </ul>
            )}
          </li>
        </ul>
        <div className="standard-sidebar-divider" />

        <ul className="standard-sidebar-menu">
          <li>
            <button
              type="button"
              onClick={() => { window.dispatchEvent(new CustomEvent("open-reader-settings")); close() }}
            >
              <Icon name="settings" /> {translate(lang, "reader.settings")}
            </button>
          </li>
          <li>
            <button
              type="button"
              onClick={() => { window.dispatchEvent(new CustomEvent("open-reader-settings")); close() }}
            >
              <Icon name="textAppearance" /> {tr("textAppearance")}
            </button>
          </li>
        </ul>
        <div className="standard-sidebar-divider" />

        <ul className="standard-sidebar-menu">
          <li>
            <button
              type="button"
              className={aboutOpen ? "active" : ""}
              onClick={() => setAboutOpen((v) => !v)}
            >
              <Icon name="about" /> {tr("about")}
            </button>
            {aboutOpen && (
              <div className="standard-sidebar-about">
                <p className="standard-sidebar-about-name">{appCfg?.collection?.name ?? iso}</p>
                {appCfg?.copyright?.holder && <p>{appCfg.copyright.holder}</p>}
                {appCfg?.copyright?.license && (
                  <p className="standard-sidebar-about-license">{appCfg.copyright.license}</p>
                )}
              </div>
            )}
          </li>
        </ul>
      </aside>
    </>
  )
}
