import { pkfUrl } from "./pkf-url"

/**
 * bcv-commons/bibles' text routes (doc/catalog-text-route.md): for every
 * edition and testament of a language, the one canonical text to read and
 * how — `catalog/<iso[0]>/<iso>/text-route.json`:
 *
 *   entries["<iso>:<canon>"]["<source id>"] = {route, id | path, why?}
 *
 * Source ids: `d:` DBT, `h:` helloAO, `p:` PKF, `o:` openbible /
 * audiobiblia, `e:` eBible, `c:` CrossWire, `g:` Door43. `id` is a DBT
 * fileset id to fetch as is; `path` an edition folder on the CDN.
 */

export type TextRouteKind = "sofria" | "usj" | "usx" | "helloao" | "plain" | "pkf"

export interface TextRoute {
  route: TextRouteKind
  id?: string
  path?: string
  /** "sofria_damaged": DBT's Sofria drops text here, the USX is canonical. */
  why?: string
}

/** One testament's routes, by source id ("d:SPABDA", "g:es-419_glt"). */
export type TextRoutes = Record<string, TextRoute>

interface TextRouteFile {
  entries?: Record<string, TextRoutes>
}

const fileCache = new Map<string, Promise<TextRouteFile | null>>()

function loadTextRouteFile(iso: string): Promise<TextRouteFile | null> {
  const cached = fileCache.get(iso)
  if (cached) return cached
  const p = fetch(pkfUrl(`/catalog/${iso[0]}/${iso}/text-route.json`))
    .then((r) => (r.ok ? (r.json() as Promise<TextRouteFile>) : null))
    .catch(() => null)
  fileCache.set(iso, p)
  return p
}

/** The routes of (iso, canon); {} when the language has none. */
export async function loadTextRoutes(iso: string, canon: "nt" | "ot"): Promise<TextRoutes> {
  return (await loadTextRouteFile(iso))?.entries?.[`${iso}:${canon}`] ?? {}
}
