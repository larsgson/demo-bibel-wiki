import { pkfUrl } from "./pkf-url"

/**
 * DBT's published text-format catalog (`catalog/text.json`, ~200KB, all
 * languages) — confirmed live at https://cdn.bibel.wiki/catalog/text.json
 * (bibles team, 2026-09), same publish path/cadence as catalog/overlap.json.
 * Per (iso, canon), lists every DBT text fileset and which formats it has
 * ("j" = text_json/Sofria, "pl" = text_plain, "u" = text_usx, "f" =
 * text_format), keyed by DBT's own "distinct_id" with each variant's real
 * fileset id encoded `t:<suffix>` (append to distinct_id to reconstruct)
 * or `T:<literal>` (use verbatim, no relation to distinct_id at all).
 *
 * This is the ONLY source of the real text_json fileset id — never guess
 * it (e.g. by appending "_ET-json" to our own resolved base id). Confirmed
 * live (2026-09): Spanish's own media.json carries `t: "SPABDA"`, which
 * this app's resolver turns into base id "SPABDA" — but DBT's REAL
 * fileset ids for that exact edition are "SPNBDAN_ET"/"SPNBDAN_ET-json"
 * (a different prefix entirely, "SPNBDA" not "SPABDA"). Guessing
 * "SPABDAN_ET-json" 404s outright; only the catalog's own literal
 * "T:SPNBDAN_ET-json" entry is a real, working fileset. The
 * language-abbreviation-vs-fileset-prefix mismatch this demonstrates is
 * real and not rare enough to risk guessing around.
 */

export interface DbtTextVariant {
  id: string
  fmt: string[]
}

export interface DbtTextCatalog {
  entries: Record<string, Record<string, DbtTextVariant[]>>
}

let catalogPromise: Promise<DbtTextCatalog | null> | null = null

function loadDbtTextCatalog(): Promise<DbtTextCatalog | null> {
  if (!catalogPromise) {
    catalogPromise = fetch(pkfUrl("/catalog/text.json"))
      .then((r) => (r.ok ? (r.json() as Promise<DbtTextCatalog>) : null))
      .catch(() => null)
  }
  return catalogPromise
}

function decodeVariantId(distinctId: string, encoded: string): string {
  if (encoded.startsWith("T:")) return encoded.slice(2)
  if (encoded.startsWith("t:")) return distinctId + encoded.slice(2)
  return encoded
}

function findVariantId(
  byDistinctId: Record<string, DbtTextVariant[]> | undefined,
  filesetId: string,
  fmt: string,
): string | null {
  if (!byDistinctId) return null
  // The catalog keys entries by DBT's own distinct_id, which in practice is
  // the BARE base id our resolver's own filesetId is built from — try it
  // as-is first, then the same letter-stripped fallback fetchDbtText
  // already uses for "combined fileset, no per-testament letter" editions
  // (e.g. French's FRNTLS), since a testament-lettered filesetId (the
  // common case, e.g. "AHRDPIN") is itself rarely a literal catalog key.
  const strippedMatch = filesetId.match(/^(.+)[NO]$/)
  const candidates = strippedMatch ? [filesetId, strippedMatch[1]] : [filesetId]
  for (const distinctId of candidates) {
    const variants = byDistinctId[distinctId]
    if (!variants) continue
    const variant = variants.find((v) => v.fmt.includes(fmt))
    if (variant) return decodeVariantId(distinctId, variant.id)
  }
  return null
}

async function dbtVariantFilesetId(
  iso: string,
  canon: "nt" | "ot",
  filesetId: string,
  fmt: string,
): Promise<string | null> {
  const catalog = await loadDbtTextCatalog()
  if (!catalog) return null
  for (const key of [`${iso}:${canon}`, `${iso}:${canon}p`]) {
    const id = findVariantId(catalog.entries[key], filesetId, fmt)
    if (id) return id
  }
  return null
}

/**
 * The exact, catalog-confirmed DBT fileset id for this edition's
 * text_json variant — null when this edition has none (or the catalog is
 * unreachable, which is treated the same as "none": no id to guess with,
 * so chapter-doc.ts just falls back to the next tier, same as before this
 * catalog existed at all).
 */
export function dbtSofriaFilesetId(iso: string, canon: "nt" | "ot", filesetId: string): Promise<string | null> {
  return dbtVariantFilesetId(iso, canon, filesetId, "j")
}

/**
 * The exact, catalog-confirmed DBT fileset id for this edition's text_usx
 * variant — same "never guess" reasoning as dbtSofriaFilesetId. See
 * dbt-usx.ts for what consumes this (a live Proskomma import, not a
 * hand-written USX parser — Proskomma already handles USX natively).
 */
export function dbtUsxFilesetId(iso: string, canon: "nt" | "ot", filesetId: string): Promise<string | null> {
  return dbtVariantFilesetId(iso, canon, filesetId, "u")
}
