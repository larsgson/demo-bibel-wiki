import { useState, useEffect } from "react"
import { resolveTextEditions } from "../lib/bw/text-edition"
import { t as translate } from "../lib/bw/ui-locales"
import { uiLangForRegion } from "../lib/data/region-config"
import { $activeRegion } from "../stores/region-store"

interface Props {
  iso?: string
}

function getIsoFromUrl(): string {
  if (typeof window === "undefined") return "eng"
  const params = new URLSearchParams(window.location.search)
  if (params.has("lang")) return params.get("lang")!
  const segs = window.location.pathname.split("/").filter(Boolean)
  if (segs.length >= 1 && /^[a-z]{3}$/.test(segs[0])) return segs[0]
  return "eng"
}

/** Whether ANY text edition resolves for this language, in either canon —
 *  a language with audio but no indexed text source anywhere resolves to
 *  neither, and the reader has nothing to show. */
async function hasAnyChapterText(iso: string): Promise<boolean> {
  const [nt, ot] = await Promise.all([resolveTextEditions(iso, "nt"), resolveTextEditions(iso, "ot")])
  return nt.length > 0 || ot.length > 0
}

export function ReaderLoader({ iso: isoProp }: Props) {
  const [iso] = useState(() => isoProp || getIsoFromUrl())
  const [ready, setReady] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    hasAnyChapterText(iso)
      .then((ok) => {
        if (!ok) { setError(`NO_CHAPTER_READER:${iso}`); setLoading(false); return }
        setReady(true)
        setLoading(false)
      })
      .catch((e) => { setError(e.message); setLoading(false) })
  }, [iso])

  const uiLang = uiLangForRegion($activeRegion.get())

  if (loading) {
    return <div style={{ padding: "2rem", color: "rgba(0,11,99,0.5)" }}>{translate(uiLang, "reader.loading")}</div>
  }
  if (error?.startsWith("NO_CHAPTER_READER:")) {
    return <div style={{ padding: "2rem", color: "rgba(0,11,99,0.5)" }}>{translate(uiLang, "reader.noLanguageData")}</div>
  }
  if (error) {
    return <div style={{ padding: "2rem", color: "rgb(180,80,20)" }}>{translate(uiLang, "reader.error")}: {error}</div>
  }
  if (!ready) return null

  return <div id="reader-mount" data-iso={iso} />
}
