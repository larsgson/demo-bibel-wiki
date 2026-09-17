import { pkfUrl } from "./pkf-url"
import { shouldProbePkf } from "./language-list"
import { fetchCatalog, type Catalog } from "../reader/catalog"

/**
 * One cached loader for `/pkf/<iso>/info.json` and the asset pairing derived
 * from it, replacing six separate ad-hoc copies of this same fetch
 * (ReaderLoader.tsx, chapter-store.ts, prefetch.ts, dbt-media.ts's
 * loadPkfAudioItems, BiblePickerSheet.tsx, AppSidebar.tsx, StoryReaderIsland's
 * loadPkfMedia) — see internal-docs/unified-text-pipeline.md.
 */

export interface PkfInfo {
  assets?: Array<{ kind: string; base: string; name: string }>
  figure_urls?: Record<string, string>
  media?: any
  [key: string]: unknown
}

export interface PkfAssets {
  docSetId: string
  pkfUrl: string
  catalogUrl: string | null
  styleUrl: string
  figureUrls: Record<string, string>
  media: any
}

const infoCache = new Map<string, Promise<PkfInfo | null>>()

/** Raw `/pkf/<iso>/info.json`, cached. Skips the fetch entirely (no request
 *  at all) for `iso === "eng"` (never a PKF language) or when
 *  shouldProbePkf(iso) says this language has no .pkf bundle at all — the
 *  same gate every one of the six call sites this replaces already used. */
export function loadPkfInfo(iso: string): Promise<PkfInfo | null> {
  const cached = infoCache.get(iso)
  if (cached) return cached
  const p = (async () => {
    if (iso === "eng" || !(await shouldProbePkf(iso))) return null
    try {
      const resp = await fetch(pkfUrl(`/pkf/${iso}/info.json`))
      if (!resp.ok) return null
      return (await resp.json()) as PkfInfo
    } catch {
      return null
    }
  })()
  infoCache.set(iso, p)
  return p
}

/** The pkf+json asset pairing + derived URLs every PKF consumer needs —
 *  same lookup ReaderLoader.tsx/chapter-store.ts each did independently.
 *  Returns null when info.json has no usable pkf asset (or no matching
 *  json catalog asset, for callers — like the main reader — that need one). */
export function pkfAssetsOf(iso: string, info: PkfInfo | null): PkfAssets | null {
  if (!info) return null
  const pkfAsset = info.assets?.find((a) => a.kind === "pkf")
  if (!pkfAsset) return null
  const catalogAsset = info.assets?.find((a) => a.kind === "json" && a.base === pkfAsset.base) ?? null
  return {
    docSetId: pkfAsset.base,
    pkfUrl: pkfUrl(`/pkf/${iso}/${pkfAsset.name}`),
    catalogUrl: catalogAsset ? pkfUrl(`/pkf/${iso}/${catalogAsset.name}`) : null,
    // The authoritative reader stylesheet (spec §7/§10.4): fonts + all three
    // theme palettes, scoped entirely to #container. Supersedes style_delta.
    styleUrl: pkfUrl(`/pkf/${iso}/styles/bundle.css`),
    figureUrls: info.figure_urls ?? {},
    media: info.media ?? { videos: [], audio: { base_url: null, items: [] } },
  }
}

const catalogCache = new Map<string, Promise<Catalog | null>>()

/** The PKF per-language book/chapter catalog, cached. Used to check whether
 *  a canon/book is actually covered by this language's PKF docSet BEFORE
 *  loading the (often multi-MB) binary — see chapter-doc.ts. */
export function loadPkfCatalog(iso: string): Promise<Catalog | null> {
  const cached = catalogCache.get(iso)
  if (cached) return cached
  const p = (async () => {
    const info = await loadPkfInfo(iso)
    const assets = pkfAssetsOf(iso, info)
    if (!assets?.catalogUrl) return null
    try {
      return await fetchCatalog(assets.catalogUrl)
    } catch {
      return null
    }
  })()
  catalogCache.set(iso, p)
  return p
}
