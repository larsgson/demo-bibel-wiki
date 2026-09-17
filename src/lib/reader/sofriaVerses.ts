import type { SofriaContent, SofriaDoc } from './sofria';
import type { VerseEntry } from '../templates/types';

export type { VerseEntry };

/**
 * Extract per-verse plain text from a Sofria chapter — shared by every
 * consumer that only needs `{num, text}[]` rather than rendered HTML
 * (StoryReaderIsland, ParallelView). Moved out of
 * src/lib/templates/verseText.ts (2026-09) so it can operate identically on
 * both native PKF Sofria docs and the emulated ones built for helloAO/DBT/
 * openbible content — see sofriaEmulate.ts.
 */

// Top-level paragraph markers that never carry scripture verse text — a
// heading/superscription/title paragraph must never be appended to
// whichever verse happened to be open before it. PKF chapters rarely place
// these at top level (they're usually top-level grafts, which are already
// skipped below), but the emulators for helloAO/DBT DO emit some of these
// as plain top-level paragraphs (e.g. `usfm:d` for a Hebrew subtitle) —
// without this guard their text would silently merge into the previous
// verse's buffer instead of being ignored.
const NON_SCRIPTURE_MARKER = /^(d|s\d?|ms\d?|mt\d?|r|sp|sr|mr|cl|b)$/;

function usfmMarker(subtype: string | undefined): string {
    if (!subtype) return '';
    return subtype.startsWith('usfm:') ? subtype.slice(5) : subtype;
}

export function extractVersesFromSofria(doc: SofriaDoc): VerseEntry[] {
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
                const num = parseInt((it.atts?.number ?? '').toString(), 10);
                currentNum = Number.isFinite(num) ? num : 0;
                continue;
            }
            if (it.type === 'wrapper') {
                if (it.subtype === 'verses') {
                    pushVerse();
                    const raw = it.atts?.['number'];
                    const num = parseInt(Array.isArray(raw) ? raw[0] : String(raw ?? ''), 10);
                    currentNum = Number.isFinite(num) ? num : currentNum;
                }
                walk(it.content);
            }
            if (it.type === 'graft') continue; // skip footnotes / xrefs / figs
        }
    }

    for (const block of doc.sequence?.blocks ?? []) {
        if (block.type !== 'paragraph') continue; // top-level grafts (titles/headings) intentionally skipped
        if (NON_SCRIPTURE_MARKER.test(usfmMarker(block.subtype))) continue;
        walk(block.content);
    }
    pushVerse();
    return verses.sort((a, b) => a.num - b.num);
}
