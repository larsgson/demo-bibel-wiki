import { useEffect, useState } from "react"
import { useStore } from "@nanostores/react"
import {
  $selectedLanguage,
  $secondaryLanguages,
  $languageNames,
  setLanguage,
  loadLanguageNames,
  initLanguageFromUrl,
} from "../stores/language-store"
import { buildLangHref } from "../lib/bw/url-utils"
import { t as translate } from "../lib/bw/ui-locales"
import LanguagePicker from "./LanguagePicker"

interface Props {
  lang?: "en" | "es"
}

export default function LanguageButton({ lang = "es" }: Props) {
  const primary = useStore($selectedLanguage)
  const secondaries = useStore($secondaryLanguages)
  const names = useStore($languageNames)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    initLanguageFromUrl()
    loadLanguageNames()
    // Let other surfaces (e.g. the region landing) open the picker.
    const onOpen = () => setOpen(true)
    window.addEventListener("open-language-picker", onOpen)
    return () => window.removeEventListener("open-language-picker", onOpen)
  }, [])

  const label = (code: string) => names[code]?.n || code.toUpperCase()

  function handleSelectPrimary(iso: string) {
    setOpen(false)
    if (iso === primary) return
    setLanguage(iso)
    // Primary change navigates to the new language URL, re-initializing all
    // islands from the canonical URL (keeps secondaries via ?langs=).
    const parts = window.location.pathname.split("/").filter(Boolean)
    let rest: string
    if (parts[0] === "l") rest = parts.slice(1).join("/")
    else if (parts.length >= 1 && /^[a-z]{3}$/.test(parts[0])) rest = parts.slice(1).join("/")
    else rest = parts.join("/")
    window.location.href = buildLangHref(iso, rest, secondaries)
  }

  return (
    <>
      <button
        type="button"
        className="lang-button"
        onClick={() => setOpen(true)}
        aria-label={translate(lang, "app.changeLanguage")}
      >
        <span className="lang-button-globe">🌐</span>
        <span className="lang-button-label">{label(primary)}</span>
        {secondaries.length > 0 && (
          <span className="lang-button-count">+{secondaries.length}</span>
        )}
      </button>

      <LanguagePicker
        open={open}
        onClose={() => setOpen(false)}
        onSelect={handleSelectPrimary}
        selected={[primary]}
        lang={lang}
      />
    </>
  )
}
