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
  /** Shared SAB scripture sheet, relative to `/pkf/<iso>/` (e.g. `../_styles/sab-scripture.css`). */
  style_shared?: string
  /** Per-language fonts + theme palettes, relative to `/pkf/<iso>/` (e.g. `styles/delta.css`). */
  style_delta?: string
  [key: string]: unknown
}

export interface PkfAssets {
  docSetId: string
  pkfUrl: string
  catalogUrl: string | null
  /** Stylesheets to `<link>` for this language, in cascade order. */
  styleUrls: string[]
  figureUrls: Record<string, string>
  media: any
}

// se-regional-data's shared `sab-scripture.css` is not yet scoped to
// `#container`/`.reader-root` (bare `a:link`, `div.p`, `table`, `img`…), so
// loading it would restyle the app chrome. Until it is, reader.css covers the
// scripture rules and only the (already scoped) delta.css is loaded. See
// internal-docs/sofria-rendering-migration.md, Phase 0.
const LOAD_SHARED_STYLESHEET = false

/** Resolve a path from info.json (relative to `/pkf/<iso>/`) to a fetchable
 *  URL, keeping it root-relative when no PUBLIC_PKF_BASE_URL is set. */
function resolvePkfPath(iso: string, rel: string): string {
  const dummy = "http://pkf.invalid"
  const url = new URL(rel, new URL(pkfUrl(`/pkf/${iso}/`), dummy))
  return url.origin === dummy ? url.pathname : url.href
}

/** The stylesheets this language's info.json points at: the per-language
 *  `delta.css` (fonts + all three theme palettes, scoped to
 *  `:is(#container,.reader-root)[data-iso]`), preceded by the shared sheet
 *  once that is safe to load. */
export function pkfStyleUrls(iso: string, info: PkfInfo | null): string[] {
  const urls: string[] = []
  if (LOAD_SHARED_STYLESHEET && info?.style_shared) urls.push(resolvePkfPath(iso, info.style_shared))
  urls.push(resolvePkfPath(iso, info?.style_delta ?? "styles/delta.css"))
  return urls
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
    styleUrls: pkfStyleUrls(iso, info),
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
