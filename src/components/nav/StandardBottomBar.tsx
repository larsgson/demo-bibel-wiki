import { useEffect, useRef, useState } from "react"
import { $activePane, showBible, showSearch } from "../../stores/branch-view-store"
import { uiLangForRegion } from "../../lib/data/region-config"
import { $activeRegion } from "../../stores/region-store"
import { t } from "../../lib/bw/ui-locales"
import { $uiLevel, setUILevel, type UILevel } from "../../stores/ui-level-store"

/**
 * Standard-mode bottom tab bar — modelled on sab-pwa's BottomNavigationBar
 * (icon + label columns, active-tab highlight). Reduced to the tabs that
 * apply here: Bible, Search (UI shell only for now), Audio (moved here from
 * the reader topbar's ♪ icon — see Reader.svelte's `toggle-inline-audio`
 * window event), and Mode (the interface-level switcher, which the header's
 * gear can no longer reach here since the header is hidden in this mode —
 * see setUILevel, the same store the header's gear already uses).
 * Settings was here too but got removed — it's reachable from
 * StandardSidebar's Settings/Text Appearance items, same reasoning as the
 * reader topbar's own icon trim.
 * Peripheral sab-pwa tabs (Bookmarks/Plans/About/Contents) are intentionally
 * omitted, not reproduced.
 *
 * Visibility is CSS-gated to `html[data-ui-level="2"]` (sidebar.css); this
 * component always renders, so it's mounted once in BaseLayout like
 * AppSidebar/BiblePickerSheet.
 */
export function StandardBottomBar() {
  const [pane, setPane] = useState(() => $activePane.get().pane)
  const [level, setLevel] = useState<UILevel>(() => $uiLevel.get())
  const [levelOpen, setLevelOpen] = useState(false)
  const [audio, setAudio] = useState({ hasAudio: false, inline: false })
  const popoverRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const onPaneChanged = (e: Event) => {
      setPane((e as CustomEvent).detail?.pane)
    }
    const onAudioState = (e: Event) => {
      const detail = (e as CustomEvent).detail
      if (detail) setAudio({ hasAudio: !!detail.hasAudio, inline: !!detail.inline })
    }
    window.addEventListener("pane-changed", onPaneChanged)
    window.addEventListener("audio-bar-state-changed", onAudioState)
    const unsubscribe = $uiLevel.subscribe(setLevel)
    return () => {
      window.removeEventListener("pane-changed", onPaneChanged)
      window.removeEventListener("audio-bar-state-changed", onAudioState)
      unsubscribe()
    }
  }, [])

  // Close the level popover on an outside click, same pattern as the header's.
  useEffect(() => {
    if (!levelOpen) return
    const onDocClick = (e: MouseEvent) => {
      if (!popoverRef.current?.contains(e.target as Node)) setLevelOpen(false)
    }
    const id = setTimeout(() => document.addEventListener("click", onDocClick), 0)
    return () => {
      clearTimeout(id)
      document.removeEventListener("click", onDocClick)
    }
  }, [levelOpen])

  const uiLang = uiLangForRegion($activeRegion.get())
  const tr = (k: string) => t(uiLang, `nav.${k}`)

  function toggleAudio() {
    if (!audio.hasAudio) return
    window.dispatchEvent(new CustomEvent("toggle-inline-audio"))
  }

  function chooseLevel(n: UILevel) {
    setUILevel(n)
    setLevelOpen(false)
  }

  const LEVELS: { value: UILevel; key: string }[] = [
    { value: 1, key: "levelSimple" },
    { value: 2, key: "levelStandard" },
    { value: 3, key: "levelStudy" },
  ]

  return (
    <nav className="standard-bottom-bar" aria-label={tr("navigation")}>
      <button
        type="button"
        className={`standard-bottom-tab ${pane === "bible" ? "active" : ""}`}
        onClick={() => showBible()}
      >
        <span className="standard-bottom-tab-icon" aria-hidden="true">📖</span>
        <span className="standard-bottom-tab-label">{tr("bible")}</span>
      </button>
      <button
        type="button"
        className={`standard-bottom-tab ${pane === "search" ? "active" : ""}`}
        onClick={() => showSearch()}
      >
        <span className="standard-bottom-tab-icon" aria-hidden="true">🔍</span>
        <span className="standard-bottom-tab-label">{tr("search")}</span>
      </button>
      <button
        type="button"
        className={`standard-bottom-tab ${audio.inline ? "active" : ""}`}
        disabled={!audio.hasAudio}
        onClick={toggleAudio}
      >
        <span className="standard-bottom-tab-icon" aria-hidden="true">♪</span>
        <span className="standard-bottom-tab-label">{t(uiLang, "reader.tabAudio")}</span>
      </button>
      <div className="standard-bottom-tab-wrapper" ref={popoverRef}>
        <button
          type="button"
          className={`standard-bottom-tab ${levelOpen ? "active" : ""}`}
          aria-label={tr("interfaceLevel")}
          onClick={() => setLevelOpen((v) => !v)}
        >
          <span className="standard-bottom-tab-icon" aria-hidden="true">⚙️</span>
          <span className="standard-bottom-tab-label">{tr("level")}</span>
        </button>
        {levelOpen && (
          <div className="standard-level-popover">
            {LEVELS.map((l) => (
              <button
                key={l.value}
                type="button"
                className={`standard-level-option ${level === l.value ? "active" : ""}`}
                onClick={() => chooseLevel(l.value)}
              >
                <span className="standard-level-dots">
                  {"●".repeat(l.value) + "○".repeat(3 - l.value)}
                </span>
                <span>{tr(l.key)}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </nav>
  )
}
