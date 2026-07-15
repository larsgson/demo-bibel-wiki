import { useEffect, useState } from "react"
import { useStore } from "@nanostores/react"
import { $selectedIso } from "../../stores/iso-store"
import { $activePane, showBible, showSearch } from "../../stores/branch-view-store"
import { t as translate } from "../../lib/bw/ui-locales"

/**
 * Standard-mode left navigation drawer — a flat menu list modelled directly
 * on sab-pwa's Sidebar.svelte (header + `<ul>` of icon+label buttons sliding
 * in from the left over a backdrop), not the hierarchical book/story tree of
 * AppSidebar.tsx. That tree is Study-mode (level 3) only; this is Standard
 * (level 2) only — see sidebar.css's `data-ui-level` gating. Both share the
 * same reader-topbar hamburger, which dispatches the right toggle event for
 * whichever level is active (Reader.svelte's openSidebar()).
 *
 * Kept to the items sab-pwa's drawer offers that this app actually has a
 * working destination for (Bible, Search, Text Appearance) — sab-pwa's
 * Firebase-only items (Account, History, Bookmarks list, Plans, About, custom
 * menuItems) have no equivalent here and are intentionally omitted rather
 * than linked to nowhere, same call StandardBottomBar already made.
 */
export function StandardSidebar() {
  const [isOpen, setIsOpen] = useState(false)
  const storeIso = useStore($selectedIso)
  const [pane, setPane] = useState(() => $activePane.get().pane)

  const iso = storeIso || "eng"
  const lang: "en" | "es" = iso === "eng" ? "en" : "es"
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

  function close() {
    setIsOpen(false)
  }

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
            <button
              type="button"
              className={pane === "bible" ? "active" : ""}
              onClick={() => { showBible(); close() }}
            >
              <span aria-hidden="true">📖</span> {tr("bible")}
            </button>
          </li>
          <li>
            <button
              type="button"
              className={pane === "search" ? "active" : ""}
              onClick={() => { showSearch(); close() }}
            >
              <span aria-hidden="true">🔍</span> {tr("search")}
            </button>
          </li>
          <li>
            <button
              type="button"
              onClick={() => { window.dispatchEvent(new CustomEvent("open-reader-settings")); close() }}
            >
              <span aria-hidden="true">🔤</span> {translate(lang, "reader.settings")}
            </button>
          </li>
        </ul>
      </aside>
    </>
  )
}
