import { useState, useEffect } from "react"
import { pkfUrl } from "../lib/bw/pkf-url"
import { hasPkf } from "../lib/bw/language-list"
import { resolveVersion } from "../lib/bw/version-config"
import { resolveTextSource } from "../lib/bw/source-catalog"
import { t as translate } from "../lib/bw/ui-locales"
import { uiLangForRegion } from "../lib/data/region-config"
import { $activeRegion } from "../stores/region-store"

interface ReaderData {
  iso: string
  /** Any helloAO translation id (e.g. "BSB") — set for ANY helloAO-backed
   *  full-chapter language, not just English. The mechanism is identical
   *  regardless of translation id: same headings/poetry/footnote structure. */
  helloaoTranslationId: string | null
  /** DBT-style fileset ids, one per testament — set only when the resolved
   *  provider is "dbt" (which has no rich structure to render, unlike
   *  helloAO's API — see Reader.svelte's flat-mode comment). Null for both
   *  the PKF and helloAO-full paths. */
  flatFilesets: { nt: string | null; ot: string | null } | null
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
    // No PKF, helloAO, or DBT text source resolves for this language at all
    // (e.g. a DBT-only language with audio but no text fileset indexed).
    return <div style={{ padding: "2rem", color: "rgba(0,11,99,0.5)" }}>{translate(uiLang, "reader.noLanguageData")}</div>
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
      data-flat-nt={data.flatFilesets?.nt ?? ""}
      data-flat-ot={data.flatFilesets?.ot ?? ""}
    />
  )
}

function helloaoReaderData(iso: string, tid: string): ReaderData {
  return {
    iso,
    helloaoTranslationId: tid,
    flatFilesets: null,
    docSetId: `helloao_${tid}`,
    pkfUrl: "",
    catalogUrl: "",
    styleUrl: null,
    figureUrls: {},
    captionMode: "hide",
    media: { videos: [], audio: { base_url: null, items: [] } },
  }
}

async function loadReaderData(iso: string): Promise<ReaderData> {
  // Text channel from the version config. Only an EXPLICIT catalog entry
  // (slug !== null) overrides the auto-detection below; unconfigured
  // languages keep today's behaviour (eng → helloAO's BSB, .pkf → pkf
  // reader, else → resolved live from the source catalog). "bsb" is a
  // back-compat provider alias for "helloao, full chapter reader, with a
  // specific curated translation id" — the mechanism itself (catalog +
  // chapter render) is generic to any helloAO translation id, not just
  // BSB/English, and applies below to ANY helloAO-sourced language, not
  // just ones explicitly flagged "bsb".
  const resolved = resolveVersion(iso)
  const textProvider = resolved.slug ? resolved.text.provider : null

  const wantsExplicitHelloaoFull = textProvider === "bsb" || (!textProvider && iso === "eng")

  if (wantsExplicitHelloaoFull) {
    // Explicit config id wins; otherwise the build-time-resolved catalog
    // (unambiguous case only — see source-catalog.ts); "BSB" is English's
    // own long-standing default, not a general fallback for other languages.
    const catalogSource = await resolveTextSource(iso, "nt")
    const tid = resolved.text.id ?? catalogSource?.id ?? (iso === "eng" ? "BSB" : null)
    if (tid) return helloaoReaderData(iso, tid)
    // No id resolvable even for the explicit-full path — fall through to
    // the generic per-canon resolution below rather than giving up here.
  }

  // .pkf text — explicit config, or auto-detected.
  if (textProvider === "pkf" || hasPkf(iso)) {
    // hasPkf(iso) said this language should have a PKF asset, but the
    // info.json fetch or the asset lookup can still fail (missing/malformed
    // data) — fall through to the generic resolution below rather than
    // surfacing a raw error screen for what a visitor experiences
    // identically either way (this language's PKF text isn't usable).
    const infoResp = await fetch(pkfUrl(`/pkf/${iso}/info.json`))
    if (infoResp.ok) {
      const info = await infoResp.json()
      const pkfAsset = info.assets?.find((a: any) => a.kind === "pkf") ?? null
      const catalogAsset = pkfAsset
        ? info.assets?.find((a: any) => a.kind === "json" && a.base === pkfAsset.base) ?? null
        : null
      if (pkfAsset && catalogAsset) {
        return {
          iso,
          helloaoTranslationId: null,
          flatFilesets: null,
          docSetId: pkfAsset.base,
          pkfUrl: pkfUrl(`/pkf/${iso}/${pkfAsset.name}`),
          catalogUrl: pkfUrl(`/pkf/${iso}/${catalogAsset.name}`),
          // The authoritative reader stylesheet (spec §7/§10.4): fonts + all
          // three theme palettes, scoped entirely to #container. Supersedes
          // style_delta.
          styleUrl: pkfUrl(`/pkf/${iso}/styles/bundle.css`),
          figureUrls: info.figure_urls ?? {},
          captionMode: "hide",
          media: info.media ?? { videos: [], audio: { base_url: null, items: [] } },
        }
      }
    }
  }

  // Generic resolution for everything else, via the build-time source
  // catalog (per canon — NT and OT can resolve to different providers,
  // e.g. different DBT filesets, or one canon simply missing). ANY
  // helloAO-sourced canon gets the SAME rich renderer English/BSB does —
  // the underlying API has identical headings/poetry/footnote structure
  // regardless of translation id. Only "dbt" falls to the flat renderer,
  // since DBT's API genuinely has no such structure (see
  // src/lib/reader/flatChapterRender.ts).
  const [nt, ot] = await Promise.all([resolveTextSource(iso, "nt"), resolveTextSource(iso, "ot")])
  const helloaoSource = [nt, ot].find((r) => r?.provider === "helloao" && r.id)
  if (helloaoSource?.id) return helloaoReaderData(iso, helloaoSource.id)

  const dbtNt = nt?.provider === "dbt" ? (nt.id ?? null) : null
  const dbtOt = ot?.provider === "dbt" ? (ot.id ?? null) : null
  if (dbtNt || dbtOt) {
    return {
      iso,
      helloaoTranslationId: null,
      flatFilesets: { nt: dbtNt, ot: dbtOt },
      docSetId: `flat_${iso}`,
      pkfUrl: "",
      catalogUrl: "",
      styleUrl: null,
      figureUrls: {},
      captionMode: "hide",
      media: { videos: [], audio: { base_url: null, items: [] } },
    }
  }

  throw new Error(`NO_CHAPTER_READER:${iso}`)
}
