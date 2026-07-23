import { useState, useEffect } from "react"
import { pkfUrl } from "../lib/bw/pkf-url"
import { hasPkf } from "../lib/bw/language-list"
import { resolveVersion } from "../lib/bw/version-config"
import { resolveTextSource } from "../lib/bw/source-catalog"
import { t as translate } from "../lib/bw/ui-locales"
import { uiLangForRegion } from "../lib/data/region-config"
import { $activeRegion } from "../stores/region-store"
import { DbtChapterReader } from "./DbtChapterReader"

interface ReaderData {
  iso: string
  /** Any helloAO translation id (e.g. "BSB") — set for ANY helloAO-backed
   *  full-chapter language, not just English. Null for the PKF/Proskomma path. */
  helloaoTranslationId: string | null
  docSetId: string
  pkfUrl: string
  catalogUrl: string
  styleUrl: string | null
  figureUrls: Record<string, string>
  captionMode: string
  media: any
}

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

export function ReaderLoader({ iso: isoProp }: Props) {
  const [iso] = useState(() => isoProp || getIsoFromUrl())
  const [data, setData] = useState<ReaderData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    loadReaderData(iso)
      .then((d) => { setData(d); setLoading(false) })
      .catch((e) => { setError(e.message); setLoading(false) })
  }, [iso])

  const uiLang = uiLangForRegion($activeRegion.get())

  if (loading) {
    return <div style={{ padding: "2rem", color: "rgba(0,11,99,0.5)" }}>{translate(uiLang, "reader.loading")}</div>
  }
  if (error?.startsWith("NO_CHAPTER_READER:")) {
    // Non-.pkf language → full-chapter reader backed by DBT/helloao.
    return <DbtChapterReader iso={iso} lang={uiLang} />
  }
  if (error) {
    return <div style={{ padding: "2rem", color: "rgb(180,80,20)" }}>{translate(uiLang, "reader.error")}: {error}</div>
  }
  if (!data) return null

  return (
    <div
      id="reader-mount"
      data-iso={data.iso}
      data-doc-set-id={data.docSetId}
      data-pkf-url={data.pkfUrl}
      data-catalog-url={data.catalogUrl}
      data-style-url={data.styleUrl ?? ""}
      data-figure-urls={JSON.stringify(data.figureUrls)}
      data-caption-mode={data.captionMode}
      data-media={JSON.stringify(data.media)}
      data-helloao-tid={data.helloaoTranslationId ?? ""}
    />
  )
}

async function loadReaderData(iso: string): Promise<ReaderData> {
  // Text channel from the version config. Only an EXPLICIT catalog entry
  // (slug !== null) overrides the auto-detection below; unconfigured languages
  // keep today's behaviour (eng → helloAO's BSB, .pkf → pkf reader, else →
  // DBT/helloao chapter reader). "bsb" is a back-compat provider alias for
  // "helloao, full chapter reader" — the mechanism itself (catalog + chapter
  // render) is generic to any helloAO translation id, not just BSB/English.
  const resolved = resolveVersion(iso)
  const textProvider = resolved.slug ? resolved.text.provider : null

  const wantsFullHelloaoReader = textProvider === "bsb" || (!textProvider && iso === "eng")

  if (wantsFullHelloaoReader) {
    // Explicit config id wins; otherwise the build-time-resolved catalog
    // (unambiguous case only — see source-catalog.ts); "BSB" is English's
    // own long-standing default, not a general fallback for other languages.
    const catalogSource = await resolveTextSource(iso, "nt")
    const tid = resolved.text.id ?? catalogSource?.id ?? (iso === "eng" ? "BSB" : null)
    if (!tid) throw new Error(`NO_CHAPTER_READER:${iso}`)
    return {
      iso,
      helloaoTranslationId: tid,
      docSetId: `helloao_${tid}`,
      pkfUrl: "",
      catalogUrl: "",
      styleUrl: null,
      figureUrls: {},
      captionMode: "hide",
      media: { videos: [], audio: { base_url: null, items: [] } },
    }
  }

  // helloao text → the full-chapter DBT/helloao reader.
  if (textProvider === "helloao") throw new Error(`NO_CHAPTER_READER:${iso}`)

  // .pkf text — explicit config, or auto-detected. Bridge languages like
  // Spanish carry their scripture via DBT (the story-reader path), so if there
  // is no .pkf and the config didn't force one, hand off to the chapter reader.
  if (textProvider !== "pkf" && !hasPkf(iso)) throw new Error(`NO_CHAPTER_READER:${iso}`)

  // hasPkf(iso) said this language should have a PKF asset, but the info.json
  // fetch or the asset lookup can still fail (missing/malformed data) — fall
  // back to the DBT/helloao chapter reader same as every other "no PKF path"
  // case above, rather than surfacing a raw error screen for what a visitor
  // experiences identically either way (this language's PKF text isn't usable).
  const infoResp = await fetch(pkfUrl(`/pkf/${iso}/info.json`))
  if (!infoResp.ok) throw new Error(`NO_CHAPTER_READER:${iso}`)
  const info = await infoResp.json()

  const pkfAsset = info.assets?.find((a: any) => a.kind === "pkf") ?? null
  const catalogAsset = pkfAsset
    ? info.assets?.find((a: any) => a.kind === "json" && a.base === pkfAsset.base) ?? null
    : null

  if (!pkfAsset || !catalogAsset) throw new Error(`NO_CHAPTER_READER:${iso}`)

  return {
    iso,
    helloaoTranslationId: null,
    docSetId: pkfAsset.base,
    pkfUrl: pkfUrl(`/pkf/${iso}/${pkfAsset.name}`),
    catalogUrl: pkfUrl(`/pkf/${iso}/${catalogAsset.name}`),
    // The authoritative reader stylesheet (spec §7/§10.4): fonts + all three
    // theme palettes, scoped entirely to #container. Supersedes style_delta.
    styleUrl: pkfUrl(`/pkf/${iso}/styles/bundle.css`),
    figureUrls: info.figure_urls ?? {},
    captionMode: "hide",
    media: info.media ?? { videos: [], audio: { base_url: null, items: [] } },
  }
}
