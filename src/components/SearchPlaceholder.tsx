import { useEffect, useState } from "react"
import { $activePane } from "../stores/branch-view-store"
import { uiLangForRegion } from "../lib/data/region-config"
import { $activeRegion } from "../stores/region-store"
import { t } from "../lib/bw/ui-locales"

/**
 * Standard-mode "Search" tab — UI shell only, matching the sab-pwa search
 * page's shape (title + input), reserved for the future AI-chat integration
 * (SearchIsland already provides that experience for Study mode; wiring it
 * here is deliberately deferred, not yet).
 */
export function SearchPlaceholder() {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    setVisible($activePane.get().pane === "search")
    const onPaneChanged = (e: Event) => {
      setVisible((e as CustomEvent).detail?.pane === "search")
    }
    window.addEventListener("pane-changed", onPaneChanged)
    return () => window.removeEventListener("pane-changed", onPaneChanged)
  }, [])

  if (!visible) return null

  const uiLang = uiLangForRegion($activeRegion.get())
  const tr = (k: string) => t(uiLang, `nav.${k}`)

  return (
    <div className="search-placeholder">
      <h2 className="search-placeholder-title">{tr("search")}</h2>
      <div className="search-placeholder-box">
        <span className="search-placeholder-icon" aria-hidden="true">🔍</span>
        <input
          className="search-placeholder-input"
          type="text"
          disabled
          placeholder={tr("search")}
        />
      </div>
      <p className="search-placeholder-note">{tr("searchComingSoon")}</p>
    </div>
  )
}
