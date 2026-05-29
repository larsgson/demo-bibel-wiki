export type CatalogDoc = {
    id: string;
    bookCode: string;
    h: string | null;
    toc: string | null;
    toc2: string | null;
    toc3: string | null;
    hasIntroduction?: boolean;
    versesByChapters?: Record<string, Record<string, string>>;
};

export type Catalog = {
    id: string;
    selectors: { lang: string; abbr: string };
    documents: CatalogDoc[];
};

export async function fetchCatalog(url: string): Promise<Catalog> {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`fetch ${url}: ${res.status}`);
    return (await res.json()) as Catalog;
}

export function chapterCount(doc: CatalogDoc): number {
    const vbc = doc.versesByChapters;
    if (!vbc) return 0;
    const nums = Object.keys(vbc)
        .map((n) => parseInt(n, 10))
        .filter((n) => Number.isFinite(n));
    return nums.length === 0 ? 0 : Math.max(...nums);
}
