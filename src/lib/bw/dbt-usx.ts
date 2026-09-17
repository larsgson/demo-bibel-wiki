import { fetchDbtUsx } from "./content-sources"
import { dbtUsxFilesetId } from "./dbt-text-catalog"
import { importUsxBook, isUsxBookLoaded, usxDocSetId } from "../reader/store"
import { fetchSofria, type SofriaSeq } from "../reader/sofria"

/**
 * DBT's `text_usx` filesets, via a LIVE Proskomma import — not a
 * hand-written USX parser. Proskomma (already a dependency for PKF)
 * already parses USX 2.5/3.0 natively and produces the same Sofria shape
 * PKF's pre-thawed docSets do, confirmed directly against real DBT USX
 * files for Ahanta/Gerai/Keliko/Tachelhit (2026-09) — this just wires that
 * up as another chapter-doc.ts fallback tier, after the text_json check.
 *
 * Unlike text_json (one signed file per CHAPTER), DBT delivers text_usx
 * per whole BOOK — confirmed live: the fileset endpoint returns the
 * identical file path regardless of which chapter is requested. So this
 * fetches + imports once per (iso, fileset, book), cached for the rest of
 * the session, and every chapter of that book after the first is served
 * straight from fetchSofria with no further network/parse cost.
 */

// The selectors' "abbr" value can only contain [A-Za-z0-9 -] (SABProskomma's
// own validation) — real DBT fileset ids contain "_" (e.g.
// "AHABLGN_ET-usx"), confirmed live to be rejected outright otherwise.
function sanitizeAbbr(filesetId: string): string {
  return filesetId.replace(/[^A-Za-z0-9 -]/g, "-")
}

const inflightImports = new Map<string, Promise<void>>()

async function ensureBookImported(iso: string, usxFilesetId: string, book: string): Promise<string | null> {
  const selectors = { lang: iso, abbr: sanitizeAbbr(usxFilesetId) }
  const docSetId = usxDocSetId(selectors)
  if (isUsxBookLoaded(docSetId, book)) return docSetId

  const key = `${docSetId}:${book}`
  let p = inflightImports.get(key)
  if (!p) {
    p = (async () => {
      const usx = await fetchDbtUsx(usxFilesetId, book)
      if (usx) importUsxBook(selectors, book, usx)
    })()
    p.finally(() => inflightImports.delete(key))
    inflightImports.set(key, p)
  }
  await p
  return isUsxBookLoaded(docSetId, book) ? docSetId : null
}

/**
 * Fetch (once per book) + import + query a chapter from a DBT text_usx
 * fileset, given the RESOLVED, non-usx-specific fileset id our own
 * resolver produced (e.g. "AHRDPIN") — this looks up the real usx variant
 * id itself via dbtUsxFilesetId, same "never guess" contract as
 * fetchDbtSofria/dbtSofriaFilesetId. Returns null when this edition has no
 * text_usx variant, the fetch/import failed, or the book/chapter doesn't
 * exist in it.
 */
export async function loadDbtUsxSofria(
  iso: string,
  canon: "nt" | "ot",
  filesetId: string,
  book: string,
  chapter: number,
): Promise<SofriaSeq | null> {
  const usxFilesetId = await dbtUsxFilesetId(iso, canon, filesetId)
  if (!usxFilesetId) return null

  const docSetId = await ensureBookImported(iso, usxFilesetId, book)
  if (!docSetId) return null

  try {
    return fetchSofria(docSetId, book, chapter).sequence
  } catch {
    return null
  }
}
