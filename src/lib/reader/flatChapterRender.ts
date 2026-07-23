/**
 * Renders a flat verse array (chapter-store.loadChapter's output — DBT/
 * helloAO text with no headings/poetry/footnote structure, unlike PKF's
 * sofria rendering or helloaoChapterRender.ts's richer helloAO-full mode)
 * into the same HTML shape the rest of the reader already expects.
 *
 * Uses the SAME .verse-block/.v/data-v conventions as sofria.ts and
 * helloaoChapterRender.ts (not ParallelView.svelte's data-verse, which is a
 * separate, scroll-sync-specific marker) so Reader.svelte's existing
 * bookmark/verse-selection click handling — which already looks for
 * `.verse-block[data-v]` — works unchanged for flat-mode languages.
 */

export interface FlatVerse {
    num: number;
    text: string;
}

function esc(s: string): string {
    return s
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

export function renderFlatChapter(verses: FlatVerse[]): string {
    if (!verses.length) return '';
    const parts = verses.map(
        (v) =>
            `<span class="verse-block" data-v="${v.num}">` +
                `<span class="v" data-v="${v.num}">${v.num}</span>` +
                `${esc(v.text)}` +
            `</span>`
    );
    return `<p class="usfm-p">${parts.join(' ')}</p>`;
}
