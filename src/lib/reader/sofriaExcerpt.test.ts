import { describe, expect, it } from 'vitest';
import { excerptSofriaDoc, verseRangeIncludes } from './sofriaExcerpt';
import { renderSofria } from './sofria';
import { paragraph, versesWrapper, headingGraft, footnoteGraft } from './sofriaEmulate';
import type { SofriaDoc, SofriaWrapper } from './sofria';

// A synthetic (non-scripture) doc with two headed sections, mirroring a
// real chapter's shape closely enough to exercise the excerpt logic:
// heading "Section A" -> verses 1-3 (verse 2 carries a footnote) ->
// heading "Section B" -> verses 4-6.
function twoSectionDoc(): SofriaDoc {
    return {
        sequence: {
            type: 'main',
            blocks: [
                headingGraft('Section A'),
                paragraph('p', [
                    versesWrapper(1, ['one'], true),
                    versesWrapper(2, ['two', footnoteGraft('+', 'a note')], true),
                    versesWrapper(3, ['three'], true),
                ]),
                headingGraft('Section B'),
                paragraph('p', [
                    versesWrapper(4, ['four'], true),
                    versesWrapper(5, ['five'], true),
                    versesWrapper(6, ['six'], true),
                ]),
            ],
        },
    };
}

function verseNumbers(doc: SofriaDoc): number[] {
    const html = renderSofria(doc, {}, 'hide', [], false).html;
    // Scoped to the verse-block wrapper only — the verse-number label span
    // also carries its own data-v, which would double-count otherwise.
    return [...html.matchAll(/class="verse-block"[^>]*data-v="(\d+)"/g)].map((m) => parseInt(m[1], 10));
}

describe('verseRangeIncludes', () => {
    it('includes only the given range', () => {
        const pred = verseRangeIncludes(4, 6);
        expect([1, 3, 4, 5, 6, 7].filter(pred)).toEqual([4, 5, 6]);
    });
    it('defaults an unset start to 0 and an unset end to +Infinity', () => {
        expect(verseRangeIncludes(undefined, 3)(0)).toBe(true);
        expect(verseRangeIncludes(5, undefined)(1000)).toBe(true);
    });
});

describe('excerptSofriaDoc', () => {
    it('keeps only in-range verses and the heading immediately before them', () => {
        const doc = twoSectionDoc();
        const excerpt = excerptSofriaDoc(doc, verseRangeIncludes(1, 2));
        expect(verseNumbers(excerpt)).toEqual([1, 2]);
        const html = renderSofria(excerpt, {}, 'hide', [], false).html;
        expect(html).toContain('Section A');
        expect(html).not.toContain('Section B');
        expect(html).not.toContain('three');
    });

    it('drops a heading that is NOT immediately before an included paragraph', () => {
        const doc = twoSectionDoc();
        const excerpt = excerptSofriaDoc(doc, verseRangeIncludes(4, 6));
        expect(verseNumbers(excerpt)).toEqual([4, 5, 6]);
        const html = renderSofria(excerpt, {}, 'hide', [], false).html;
        expect(html).not.toContain('Section A');
        expect(html).toContain('Section B');
    });

    it('keeps a mid-excerpt heading when the range spans both sections', () => {
        const doc = twoSectionDoc();
        const excerpt = excerptSofriaDoc(doc, verseRangeIncludes(2, 5));
        expect(verseNumbers(excerpt)).toEqual([2, 3, 4, 5]);
        const html = renderSofria(excerpt, {}, 'hide', [], false).html;
        expect(html).toContain('Section A');
        expect(html).toContain('Section B');
    });

    it('preserves an inline footnote graft on a kept verse', () => {
        const doc = twoSectionDoc();
        const excerpt = excerptSofriaDoc(doc, verseRangeIncludes(2, 2));
        const rendered = renderSofria(excerpt, {}, 'hide', [], false);
        expect(rendered.footnotes.length).toBe(1);
        expect(rendered.footnotes[0].caller).toBe('+');
    });

    it('returns an empty doc when nothing in range exists at all', () => {
        const doc = twoSectionDoc();
        const excerpt = excerptSofriaDoc(doc, verseRangeIncludes(100, 200));
        expect(excerpt.sequence.blocks).toEqual([]);
    });

    it('supports an arbitrary predicate (discrete verse list, not a range)', () => {
        const doc = twoSectionDoc();
        const wanted = new Set([1, 4, 6]);
        const excerpt = excerptSofriaDoc(doc, (n) => wanted.has(n));
        expect(verseNumbers(excerpt)).toEqual([1, 4, 6]);
    });

    it('unwraps a nested non-verses wrapper (e.g. DBT-style wrapper/chapter) and drops it if empty', () => {
        const nested: SofriaWrapper = {
            type: 'wrapper',
            subtype: 'chapter',
            atts: { number: '1' },
            content: [
                { type: 'mark', subtype: 'chapter_label', atts: { number: '1' } },
                versesWrapper(1, ['one'], true),
                versesWrapper(2, ['two'], true),
            ],
        };
        const doc: SofriaDoc = {
            sequence: { type: 'main', blocks: [paragraph('p', [nested])] },
        };

        const kept = excerptSofriaDoc(doc, verseRangeIncludes(1, 1));
        expect(verseNumbers(kept)).toEqual([1]);

        const empty = excerptSofriaDoc(doc, verseRangeIncludes(99, 100));
        expect(empty.sequence.blocks).toEqual([]);
    });
});
