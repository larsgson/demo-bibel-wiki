/**
 * Book/chapter catalog for the main reader, built from the SAME
 * text-edition resolver chapter-doc.ts uses to fetch chapters — so the
 * catalog and the chapters it links to are always the same edition, and
 * the "BSB"/PKF hardcodes that used to live separately in Reader.svelte,
 * BiblePickerSheet.tsx and AppSidebar.tsx are gone. For each canon, tries
 * the resolver's candidates in order until one actually has a live
 * catalog; falls back to the static 66-book table when nothing does (a
 * canon this language simply has no text for stays out of the result).
 */

import type { Catalog, CatalogDoc } from "./catalog"
import { fetchHelloaoCatalog } from "./helloaoCatalog"
import { buildStaticCatalog } from "./staticCatalog"
import { resolveTextEditions } from "../bw/text-edition"
import { loadPkfCatalog } from "../bw/pkf-info"
import { loadBookList } from "../bw/book-list"
import { getTestament } from "../bw/bible-utils"
import staticBooks from "../bw/bible-books"

const BOOK_ORDER = new Map(staticBooks.map((b, i) => [b.code, i]))

async function loadCanonDocs(iso: string, canon: "nt" | "ot"): Promise<CatalogDoc[]> {
  const editions = await resolveTextEditions(iso, canon)
  for (const edition of editions) {
    try {
      if (edition.provider === "pkf" && edition.pkf) {
        const catalog = await loadPkfCatalog(iso)
        const docs = (catalog?.documents ?? []).filter((d) => getTestament(d.bookCode) === canon)
        if (docs.length) return docs
        continue
      }
      if (edition.provider === "helloao") {
        const catalog = await fetchHelloaoCatalog(edition.id)
        const docs = catalog.documents.filter((d) => getTestament(d.bookCode) === canon)
        if (docs.length) return docs
        continue
      }
      // dbt / openbible — no live per-translation catalog; synthesize from
      // the static 66-book table (with vernacular names when available).
      const bookList = await loadBookList(iso)
      const vernacular = bookList ? new Map(bookList.map((b) => [b.code, b.name])) : undefined
      const docs = buildStaticCatalog(iso, vernacular).documents.filter(
        (d) => getTestament(d.bookCode) === canon,
      )
      if (docs.length) return docs
    } catch {
      // Try the next candidate.
    }
  }
  return []
}

export async function loadReaderCatalog(iso: string): Promise<Catalog> {
  const [ntDocs, otDocs] = await Promise.all([loadCanonDocs(iso, "nt"), loadCanonDocs(iso, "ot")])
  const documents = [...ntDocs, ...otDocs].sort(
    (a, b) => (BOOK_ORDER.get(a.bookCode) ?? 0) - (BOOK_ORDER.get(b.bookCode) ?? 0),
  )
  return { id: `reader_${iso}`, selectors: { lang: iso, abbr: iso }, documents }
}
