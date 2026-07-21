import type { Catalog } from '../reader/catalog';
import { fetchSofria, type SofriaDoc } from '../reader/sofria';
import { isLoaded, loadDocSet } from '../reader/store';
import { fetchHelloaoText } from '../bw/content-sources';
import type { VerseEntry } from './types';

/**
 * Verse-level text extractor used by the story-reader. Operates on the
 * already-thawed Proskomma docset for the current ISO. Cheap: each call
 * issues one Sofria query for the chapter, walks the JSON tree, and
 * collects per-verse plain text.
 */

interface SofriaWrapperContent {
    type?: string;
    subtype?: string;
    atts?: Record<string, string | string[]>;
    content?: SofriaContent[];
    sequence?: { blocks?: SofriaBlock[] };
}
type SofriaMark = { type: 'mark'; subtype?: string; atts?: Record<string, string> };
type SofriaContent = string | SofriaMark | SofriaWrapperContent;
type SofriaBlock = {
    type: string;
    subtype?: string;
    content?: SofriaContent[];
    sequence?: { blocks?: SofriaBlock[] };
};

function plainOf(items: SofriaContent[] | undefined): string {
    if (!items) return '';
    let out = '';
    for (const it of items) {
        if (typeof it === 'string') {
            out += it;
        } else if (it && typeof it === 'object') {
            // Skip footnote / xref / fig grafts so they don't pollute the text
            if (it.type === 'graft' && it.sequence) continue;
            if (it.type === 'mark') continue; // verses_label / chapter_label
            if (it.type === 'wrapper') {
                out += plainOf(it.content);
            }
        }
    }
    return out;
}

/** Extract per-verse plain text from a Sofria chapter. */
function extractVersesFromSofria(doc: SofriaDoc): VerseEntry[] {
    const verses: VerseEntry[] = [];
    let currentNum = 0;
    let buffer = '';

    function pushVerse() {
        const trimmed = buffer.trim().replace(/\s+/g, ' ');
        if (currentNum > 0 && trimmed) {
            const existing = verses.find((v) => v.num === currentNum);
            if (existing) existing.text = (existing.text + ' ' + trimmed).trim();
            else verses.push({ num: currentNum, text: trimmed });
        }
        buffer = '';
    }

    function walk(items: SofriaContent[] | undefined) {
        if (!items) return;
        for (const it of items) {
            if (typeof it === 'string') {
                buffer += it;
                continue;
            }
            if (!it || typeof it !== 'object') continue;
            if (it.type === 'mark' && it.subtype === 'verses_label') {
                pushVerse();
                const num = parseInt(((it as SofriaMark).atts?.number ?? '').toString(), 10);
                currentNum = Number.isFinite(num) ? num : 0;
                continue;
            }
            if (it.type === 'wrapper') {
                if (it.subtype === 'verses') {
                    pushVerse();
                    const raw = (it.atts as Record<string, string | string[]> | undefined)?.['number'];
                    const num = parseInt(Array.isArray(raw) ? raw[0] : String(raw ?? ''), 10);
                    currentNum = Number.isFinite(num) ? num : currentNum;
                }
                walk(it.content);
            }
            if (it.type === 'graft') continue; // skip footnotes / xrefs / figs
        }
    }

    for (const block of doc.sequence?.blocks ?? []) {
        if (block.type === 'paragraph') walk(block.content as SofriaContent[]);
        // Top-level grafts (titles/headings) are intentionally skipped.
    }
    pushVerse();
    return verses.sort((a, b) => a.num - b.num);
}

async function fetchBsbVerses(bookCode: string, chapter: number): Promise<VerseEntry[]> {
    const verses = await fetchHelloaoText('BSB', bookCode, chapter);
    return (verses ?? []).sort((a, b) => a.num - b.num);
}

const chapterCache = new Map<string, VerseEntry[]>();

/**
 * Get verses for the given book/chapter from the (already-thawed) docset.
 * Pass `pkfUrl` so we can lazily ensure the docset is loaded if it isn't yet.
 */
export async function chapterVerses(
    docSetId: string,
    pkfUrl: string,
    bookCode: string,
    chapter: number,
    catalog?: Catalog | null
): Promise<VerseEntry[]> {
    const key = `${docSetId}|${bookCode}|${chapter}`;
    const cached = chapterCache.get(key);
    if (cached) return cached;

    if (!pkfUrl) {
        const verses = await fetchBsbVerses(bookCode, chapter);
        chapterCache.set(key, verses);
        return verses;
    }
    if (!isLoaded(docSetId)) {
        await loadDocSet(docSetId, pkfUrl);
    }
    if (catalog) {
        const has = catalog.documents.some((d) => d.bookCode === bookCode);
        if (!has) {
            chapterCache.set(key, []);
            return [];
        }
    }
    try {
        const doc = fetchSofria(docSetId, bookCode, chapter);
        const verses = extractVersesFromSofria(doc);
        chapterCache.set(key, verses);
        return verses;
    } catch {
        chapterCache.set(key, []);
        return [];
    }
}
