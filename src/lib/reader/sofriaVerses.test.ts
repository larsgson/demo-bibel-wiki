import { describe, expect, it } from 'vitest';
import { extractVersesFromSofria } from './sofriaVerses';
import type { SofriaDoc } from './sofria';

describe('extractVersesFromSofria', () => {
    it('merges a verse split across two paragraphs (real PKF shape)', () => {
        const doc: SofriaDoc = {
            sequence: {
                type: 'main',
                blocks: [
                    {
                        type: 'paragraph',
                        subtype: 'usfm:p',
                        content: [
                            {
                                type: 'wrapper',
                                subtype: 'verses',
                                atts: { number: '1' },
                                content: [
                                    { type: 'mark', subtype: 'verses_label', atts: { number: '1' } },
                                    'first half',
                                ],
                            },
                        ],
                    },
                    {
                        type: 'paragraph',
                        subtype: 'usfm:p',
                        content: [
                            {
                                type: 'wrapper',
                                subtype: 'verses',
                                atts: { number: '1' },
                                content: ['second half'],
                            },
                        ],
                    },
                ],
            },
        };
        expect(extractVersesFromSofria(doc)).toEqual([{ num: 1, text: 'first half second half' }]);
    });

    it('skips a top-level heading graft entirely', () => {
        const doc: SofriaDoc = {
            sequence: {
                type: 'main',
                blocks: [
                    { type: 'graft', sequence: { type: 'heading', blocks: [{ type: 'paragraph', subtype: 'usfm:s1', content: ['A Heading'] }] } },
                    {
                        type: 'paragraph',
                        subtype: 'usfm:p',
                        content: [
                            {
                                type: 'wrapper',
                                subtype: 'verses',
                                atts: { number: '1' },
                                content: [{ type: 'mark', subtype: 'verses_label', atts: { number: '1' } }, 'text'],
                            },
                        ],
                    },
                ],
            },
        };
        expect(extractVersesFromSofria(doc)).toEqual([{ num: 1, text: 'text' }]);
    });

    it('skips inline footnote and xref grafts', () => {
        const doc: SofriaDoc = {
            sequence: {
                type: 'main',
                blocks: [
                    {
                        type: 'paragraph',
                        subtype: 'usfm:p',
                        content: [
                            {
                                type: 'wrapper',
                                subtype: 'verses',
                                atts: { number: '1' },
                                content: [
                                    { type: 'mark', subtype: 'verses_label', atts: { number: '1' } },
                                    'before',
                                    { type: 'graft', subtype: 'footnote', sequence: { type: 'footnote', blocks: [] } },
                                    'after',
                                    { type: 'graft', subtype: 'xref', sequence: { type: 'xref', blocks: [] } },
                                ],
                            },
                        ],
                    },
                ],
            },
        };
        expect(extractVersesFromSofria(doc)).toEqual([{ num: 1, text: 'beforeafter' }]);
    });

    it('does not append a usfm:d paragraph after a verse to that verse', () => {
        const doc: SofriaDoc = {
            sequence: {
                type: 'main',
                blocks: [
                    {
                        type: 'paragraph',
                        subtype: 'usfm:p',
                        content: [
                            {
                                type: 'wrapper',
                                subtype: 'verses',
                                atts: { number: '1' },
                                content: [{ type: 'mark', subtype: 'verses_label', atts: { number: '1' } }, 'verse text'],
                            },
                        ],
                    },
                    { type: 'paragraph', subtype: 'usfm:d', content: ['A superscription'] },
                ],
            },
        };
        expect(extractVersesFromSofria(doc)).toEqual([{ num: 1, text: 'verse text' }]);
    });

    it('keeps text inside a usfm:wj wrapper', () => {
        const doc: SofriaDoc = {
            sequence: {
                type: 'main',
                blocks: [
                    {
                        type: 'paragraph',
                        subtype: 'usfm:p',
                        content: [
                            {
                                type: 'wrapper',
                                subtype: 'verses',
                                atts: { number: '1' },
                                content: [
                                    { type: 'mark', subtype: 'verses_label', atts: { number: '1' } },
                                    { type: 'wrapper', subtype: 'usfm:wj', content: ['Follow Me.'] },
                                ],
                            },
                        ],
                    },
                ],
            },
        };
        expect(extractVersesFromSofria(doc)).toEqual([{ num: 1, text: 'Follow Me.' }]);
    });

    it('flushes on a bare verses_label mark with no wrapper', () => {
        const doc: SofriaDoc = {
            sequence: {
                type: 'main',
                blocks: [
                    {
                        type: 'paragraph',
                        subtype: 'usfm:p',
                        content: [
                            { type: 'mark', subtype: 'verses_label', atts: { number: '1' } },
                            'a',
                            { type: 'mark', subtype: 'verses_label', atts: { number: '2' } },
                            'b',
                        ],
                    },
                ],
            },
        };
        expect(extractVersesFromSofria(doc)).toEqual([
            { num: 1, text: 'a' },
            { num: 2, text: 'b' },
        ]);
    });
});
