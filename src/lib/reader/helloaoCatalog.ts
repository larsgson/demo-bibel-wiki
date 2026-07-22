import type { Catalog, CatalogDoc } from './catalog';
import staticBooks from '../bw/bible-books';

const HELLOAO_API = 'https://bible.helloao.org/api';

// helloAO's books.json has no short-abbreviation field (just full name /
// commonName) — bible-books.ts's standard 66-book USFM list already supplies
// one for the reader's book-selector dropdown, independent of translation.
const abbrevByCode = new Map(staticBooks.map((b) => [b.code, b.abbrev]));

const catalogCache = new Map<string, Promise<Catalog>>();

/**
 * Live book/chapter catalog for ANY helloAO translation id (e.g. "BSB",
 * "eng-NASB", "ind_ayt") — mirrors book-list.ts's live-fetch approach rather
 * than a committed static file, so it works for every helloAO-backed
 * translation, not just one hand-picked at build/commit time (and can't go
 * stale or get silently left out of a deploy the way a gitignored local
 * file did).
 *
 * `versesByChapters` values are always `{}` — the reader only uses this
 * shape's KEYS (chapter numbers) to derive chapter counts (see
 * catalog.ts's `chapterCount`); helloAO's books.json already gives us that
 * directly via `numberOfChapters`, so there's no need for per-verse detail.
 */
export function fetchHelloaoCatalog(translationId: string): Promise<Catalog> {
    const cached = catalogCache.get(translationId);
    if (cached) return cached;

    const p = (async () => {
        const resp = await fetch(`${HELLOAO_API}/${translationId}/books.json`);
        if (!resp.ok) throw new Error(`fetch helloao catalog ${translationId}: ${resp.status}`);
        const json = await resp.json();
        const documents: CatalogDoc[] = (json.books ?? []).map((b: any) => ({
            id: `${translationId}/${b.id}`,
            bookCode: b.id,
            h: b.name ?? b.commonName ?? b.id,
            toc: b.commonName ?? b.name ?? b.id,
            toc2: abbrevByCode.get(b.id) ?? null,
            toc3: null,
            versesByChapters: Object.fromEntries(
                Array.from({ length: b.numberOfChapters ?? 0 }, (_, i) => [String(i + 1), {}])
            ),
        }));
        return {
            id: `helloao_${translationId}`,
            selectors: { lang: json.translation?.language ?? '', abbr: translationId },
            documents,
        };
    })();
    catalogCache.set(translationId, p);
    return p;
}
