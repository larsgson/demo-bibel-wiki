/**
 * Synthesizes a Catalog (see ./catalog.ts) from the static 66-book USFM
 * table, for "flat" DBT/helloAO languages that have no live per-translation
 * catalog source (unlike PKF's static JSON catalog or helloAO's books.json
 * — see helloaoCatalog.ts). This is the exact same fallback
 * DbtChapterReader.tsx and BiblePickerSheet.tsx's non-PKF path already use;
 * consolidating it here so Reader.svelte's book/chapter picker can use it
 * too instead of needing a new live catalog fetcher.
 */

import books from '../bw/bible-books';
import type { Catalog, CatalogDoc } from './catalog';

export function buildStaticCatalog(iso: string, vernacularNames?: Map<string, string>): Catalog {
    const documents: CatalogDoc[] = books.map((b) => {
        const versesByChapters: Record<string, Record<string, string>> = {};
        for (let ch = 1; ch <= b.chapters; ch++) versesByChapters[String(ch)] = {};
        const h = vernacularNames?.get(b.code) ?? b.name;
        return {
            id: `${iso}/${b.code}`,
            bookCode: b.code,
            h,
            toc: h,
            toc2: b.abbrev,
            toc3: null,
            versesByChapters
        };
    });
    return {
        id: `static_${iso}`,
        selectors: { lang: iso, abbr: iso },
        documents
    };
}
