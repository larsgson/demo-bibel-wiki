/**
 * DBT-style text-fileset id → helloAO translation id.
 *
 * `/dbt/_helloao-crosswalk.json` — 1,256 entries, built from helloAO's own
 * catalog. The two systems use different id schemes for the same content
 * (DBT: "GAZBIB", helloAO: "gaz_bib"), so a direct id match (what the old
 * helloao-audio tier assumed) never worked. This is the correct join key.
 */

import { pkfUrl } from "./pkf-url"

interface RawCrosswalk {
  count: number
  map: Record<string, string>
}

let crosswalkPromise: Promise<Map<string, string>> | null = null

function loadCrosswalk(): Promise<Map<string, string>> {
  if (crosswalkPromise) return crosswalkPromise
  crosswalkPromise = fetch(pkfUrl("/dbt/_helloao-crosswalk.json"))
    .then((r) => (r.ok ? (r.json() as Promise<RawCrosswalk>) : { count: 0, map: {} }))
    .then((raw) => new Map<string, string>(Object.entries(raw.map ?? {})))
    .catch(() => new Map<string, string>())
  return crosswalkPromise
}

/** The helloAO translation id for a DBT-style text-fileset id, if known. */
export async function toHelloaoTranslationId(dbtTextFilesetId: string): Promise<string | null> {
  const map = await loadCrosswalk()
  return map.get(dbtTextFilesetId) ?? null
}
