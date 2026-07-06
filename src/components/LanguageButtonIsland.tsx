import { useState, useEffect, useRef } from "react"
import { useStore } from "@nanostores/react"
import {
  $selectedLanguage,
  $secondaryLanguages,
  $languageNames,
  $languageData,
  loadLanguageNames,
  loadLanguageData,
  initLanguageFromUrl,
  removeSecondaryLanguage,
} from "../stores/language-store"
import { buildLangHref } from "../lib/bw/url-utils"
import { t as translate } from "../lib/bw/ui-locales"
import { uiLangForRegion } from "../lib/data/region-config"
import { $activeRegion } from "../stores/region-store"
import LanguageSelectorIsland from "./LanguageSelectorIsland"

const TIMING_CATEGORIES = ["with-timecode", "audio-with-timecode"]

export default function LanguageButtonIsland() {
  const selectedLang = useStore($selectedLanguage)
  const secondaryLangs = useStore($secondaryLanguages)
  const uiLang = uiLangForRegion($activeRegion.get())
  const languageNames = useStore($languageNames)
  const languageData = useStore($languageData)
  const [selectorMode, setSelectorMode] = useState<"primary" | "secondary" | null>(null)
  const [noAudioWarning, setNoAudioWarning] = useState(false)
  const langBeforeOpen = useRef<string>("")

  useEffect(() => {
    initLanguageFromUrl()
    loadLanguageNames()
  }, [])

  // Check audio timing availability when language data loads
  useEffect(() => {
    const checkAudio = async () => {
      const data = await loadLanguageData(selectedLang)
      if (!data) {
        setNoAudioWarning(true)
        return
      }
      setNoAudioWarning(!TIMING_CATEGORIES.includes(data.category))
    }
    checkAudio()
  }, [selectedLang])

  const getLangLabel = (code: string | null) => {
    if (!code) return null
    const names = languageNames[code]
    if (names) return names.n
    return code.toUpperCase()
  }

  const openSelector = (mode: "primary" | "secondary") => {
    langBeforeOpen.current = $selectedLanguage.get()
    setSelectorMode(mode)
  }

  const handleClose = () => {
    const mode = selectorMode
    setSelectorMode(null)

    // If primary language changed, navigate to the new language URL
    if (mode === "primary") {
      const newLang = $selectedLanguage.get()
      if (newLang !== langBeforeOpen.current) {
        const parts = window.location.pathname.split("/").filter(Boolean)

        let restPath: string
        if (parts[0] === "l") {
          restPath = parts.slice(1).join("/")
        } else if (parts.length >= 1 && /^[a-z]{3}$/.test(parts[0])) {
          restPath = parts.slice(1).join("/")
        } else {
          restPath = parts.join("/")
        }

        window.location.href = buildLangHref(newLang, restPath, $secondaryLanguages.get())
      }
    }
  }

  return (
    <>
      <div className="lang-buttons">
        <button
          className="lang-btn"
          onClick={() => openSelector("primary")}
          title={noAudioWarning ? "No audio timing available for this language" : "Change primary language"}
        >
          <div className="lang-icon-wrap">
            {noAudioWarning
              ? <span className="lang-icon" style={{ color: "#ffd166" }}>!</span>
              : <span className="lang-icon">&#127760;</span>}
            <span className="lang-code">{selectedLang}</span>
          </div>
          <span className="lang-name">{getLangLabel(selectedLang) || "Select"}</span>
        </button>
        {secondaryLangs.map((code) => (
          <button
            key={code}
            className="lang-btn lang-btn-secondary"
            onClick={() => openSelector("secondary")}
            title={getLangLabel(code) || code.toUpperCase()}
          >
            <div className="lang-icon-wrap">
              <span className="lang-icon">&#127760;</span>
              <span className="lang-code">{code}</span>
            </div>
            <span className="lang-name">{getLangLabel(code) || code.toUpperCase()}</span>
            <span
              className="lang-remove"
              onClick={(e) => { e.stopPropagation(); removeSecondaryLanguage(code) }}
              title={`Remove ${getLangLabel(code)}`}
            >
              &times;
            </span>
          </button>
        ))}
        <button
          className="lang-btn lang-btn-add"
          onClick={() => openSelector("secondary")}
          title={translate(uiLang, "app.addSecondaryLanguage")}
        >
          <span className="lang-add-icon">+</span>
        </button>
      </div>

      {selectorMode && (
        <LanguageSelectorIsland
          mode={selectorMode}
          onClose={handleClose}
        />
      )}
    </>
  )
}
