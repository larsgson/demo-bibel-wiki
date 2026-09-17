import { describe, expect, it } from 'vitest';
import { renderSofria } from './sofria';
import { extractVersesFromSofria } from './sofriaVerses';
import { helloaoChapterToSofria, flatVersesToSofria } from './sofriaEmulate';
import type { HelloaoChapterJson } from '../bw/content-sources';

// ── Fixtures — copied verbatim from live https://bible.helloao.org/api/BSB
// responses (PSA 3, MAT 1, JHN 3), confirmed 2026-09-17. Real shapes, not
// contrived — this is exactly what helloaoChapterToSofria has to handle.

const PSA_3: HelloaoChapterJson = {
    chapter: {
        number: 3,
        content: [
            { type: 'heading', content: ['Deliver Me, O LORD!'] },
            { type: 'hebrew_subtitle', content: ['A Psalm of David, when he fled from his son Absalom.'] },
            { type: 'line_break' },
            {
                type: 'verse',
                number: 1,
                content: [
                    { text: 'O LORD, how my foes have increased!', poem: 1 },
                    { text: 'How many rise up against me!', poem: 2 },
                ],
            },
            {
                type: 'verse',
                number: 2,
                content: [
                    { text: 'Many say of me,', poem: 1 },
                    { text: '“God will not deliver him.”', poem: 2 },
                    'Selah',
                    { noteId: 5 },
                ],
            },
            {
                type: 'verse',
                number: 3,
                content: [
                    { text: 'But You, O LORD, are a shield around me,', poem: 1 },
                    { text: 'my glory, and the One who lifts my head.', poem: 2 },
                ],
            },
        ],
        footnotes: [
            {
                noteId: 5,
                caller: '+',
                text: 'Selah or Interlude is probably a musical or literary term; here and throughout the Psalms.',
            },
        ],
    },
};

const MAT_1: HelloaoChapterJson = {
    chapter: {
        number: 1,
        content: [
            {
                type: 'verse',
                number: 1,
                content: ['This is the record of the genealogy of Jesus Christ, the son of David, the son of Abraham:'],
            },
            {
                type: 'verse',
                number: 11,
                content: [
                    { text: 'and Josiah the father of Jeconiah and his brothers', poem: 1 },
                    { text: 'at the time of the exile to Babylon.', poem: 2 },
                ],
            },
            {
                type: 'verse',
                number: 12,
                content: [
                    'After the exile to Babylon:',
                    { lineBreak: true },
                    { text: 'Jeconiah was the father of Shealtiel,', poem: 1 },
                    { lineBreak: true },
                    { text: 'Shealtiel the father of Zerubbabel,', poem: 1 },
                    { lineBreak: true },
                ],
            },
        ],
    },
};

const JHN_3_HEAD: HelloaoChapterJson = {
    chapter: {
        number: 3,
        content: [
            { type: 'heading', content: ['Jesus and Nicodemus'] },
            {
                type: 'verse',
                number: 1,
                content: ['Now there was a man of the Pharisees named Nicodemus, a leader of the Jews.'],
            },
            {
                type: 'verse',
                number: 2,
                content: [
                    'He came to Jesus at night and said, “Rabbi, we know that You are a teacher who has come from God. For no one could perform the signs You are doing if God were not with him.”',
                ],
            },
            { type: 'line_break' },
            {
                type: 'verse',
                number: 3,
                content: [
                    'Jesus replied, “Truly, truly, I tell you, no one can see the kingdom of God unless he is born again.',
                    { noteId: 13 },
                    '”',
                ],
            },
        ],
        footnotes: [{ noteId: 13, caller: '+', text: 'Or born from above' }],
    },
};

function verseBlockCount(html: string): number {
    return (html.match(/<span class="verse-block" data-v="\d+">/g) ?? []).length;
}
function dataVs(html: string): string[] {
    return [...html.matchAll(/<span class="verse-block" data-v="(\d+)">/g)].map((m) => m[1]);
}

describe('helloaoChapterToSofria + renderSofria (PSA 3)', () => {
    const doc = helloaoChapterToSofria(PSA_3);
    const rendered = renderSofria(doc);

    it('renders the heading and Hebrew subtitle', () => {
        expect(rendered.html).toContain('<div class="s">Deliver Me, O LORD!</div>');
        expect(rendered.html).toContain('<div class="d">A Psalm of David, when he fled from his son Absalom.</div>');
    });

    it('renders q/q2 poetry paragraphs', () => {
        expect(rendered.html).toContain('<div class="q">');
        expect(rendered.html).toContain('<div class="q2">');
    });

    it('emits one .verse-block per poetry line (2 lines per verse here)', () => {
        expect(verseBlockCount(rendered.html)).toBe(6); // 3 verses x 2 lines
        expect(dataVs(rendered.html)).toEqual(['1', '1', '2', '2', '3', '3']);
    });

    it('prints the verse number exactly once per verse (on the first line only)', () => {
        expect(rendered.html.match(/<span class="v" data-v="1">1<\/span>/g)?.length).toBe(1);
        expect(rendered.html.match(/<span class="v" data-v="2">2<\/span>/g)?.length).toBe(1);
    });

    it('resolves the footnote with its real caller', () => {
        expect(rendered.footnotes).toHaveLength(1);
        expect(rendered.footnotes[0].caller).toBe('+');
        expect(rendered.footnotes[0].html).toContain('Selah or Interlude');
        expect(rendered.html).toContain('data-note-idx="0"');
    });

    it('extracts plain verse text matching the known-correct plain extraction', () => {
        const verses = extractVersesFromSofria(doc);
        expect(verses.find((v) => v.num === 1)?.text).toBe(
            'O LORD, how my foes have increased! How many rise up against me!',
        );
        // The regression this test pins: a plain string ("Selah") following a
        // {text} fragment must get a space before it, not stick directly to
        // the preceding punctuation.
        expect(verses.find((v) => v.num === 2)?.text).toBe(
            'Many say of me, “God will not deliver him.” Selah',
        );
        expect(verses.find((v) => v.num === 3)?.text).toBe(
            'But You, O LORD, are a shield around me, my glory, and the One who lifts my head.',
        );
    });

    it('never leaks footnote or heading text into extracted verses', () => {
        const verses = extractVersesFromSofria(doc);
        const all = verses.map((v) => v.text).join(' ');
        expect(all).not.toContain('Selah or Interlude');
        expect(all).not.toContain('Deliver Me');
        expect(all).not.toContain('A Psalm of David');
    });
});

describe('helloaoChapterToSofria + renderSofria (MAT 1 — prose + poetry mix)', () => {
    const doc = helloaoChapterToSofria(MAT_1);
    const rendered = renderSofria(doc);
    const verses = extractVersesFromSofria(doc);

    it('renders pure prose as one flowing usfm-p-equivalent paragraph', () => {
        expect(rendered.html).toContain('<div class="p">');
        expect(verseBlockCount(rendered.html.split('<div class="q')[0])).toBe(1); // v1 alone before any q-block
    });

    it('extracts verse 1 (plain string, no poem) with no injected space', () => {
        expect(verses.find((v) => v.num === 1)?.text).toBe(
            'This is the record of the genealogy of Jesus Christ, the son of David, the son of Abraham:',
        );
    });

    it('extracts verse 11 (two poem lines)', () => {
        expect(verses.find((v) => v.num === 11)?.text).toBe(
            'and Josiah the father of Jeconiah and his brothers at the time of the exile to Babylon.',
        );
    });

    it('extracts verse 12 (string + explicit lineBreaks + poem lines) as one joined verse', () => {
        expect(verses.find((v) => v.num === 12)?.text).toBe(
            'After the exile to Babylon: Jeconiah was the father of Shealtiel, Shealtiel the father of Zerubbabel,',
        );
    });
});

describe('helloaoChapterToSofria (JHN 3 — top-level line_break)', () => {
    const doc = helloaoChapterToSofria(JHN_3_HEAD);
    const rendered = renderSofria(doc);
    const verses = extractVersesFromSofria(doc);

    it('splits into two prose paragraphs around the top-level line_break', () => {
        const pBlocks = rendered.html.match(/<div class="p">/g) ?? [];
        expect(pBlocks.length).toBe(2);
    });

    it('keeps verses 1+2 in the first paragraph and verse 3 in the second', () => {
        const [firstP] = rendered.html.split('<div class="p">').slice(1);
        expect(firstP).toContain('data-v="1"');
        expect(firstP).toContain('data-v="2"');
        expect(firstP).not.toContain('data-v="3"');
    });

    it('attaches a closing quote directly after a footnote with no injected space', () => {
        expect(verses.find((v) => v.num === 3)?.text).toBe(
            'Jesus replied, “Truly, truly, I tell you, no one can see the kingdom of God unless he is born again.”',
        );
    });
});

describe('helloaoChapterToSofria — edge cases', () => {
    it('still shows the verse number for a verse with no renderable content', () => {
        const doc = helloaoChapterToSofria({
            chapter: { number: 1, content: [{ type: 'verse', number: 9, content: [] }] },
        });
        const rendered = renderSofria(doc);
        expect(rendered.html).toContain('<span class="v" data-v="9">9</span>');
        expect(extractVersesFromSofria(doc)).toEqual([]); // no text at all -> not a real verse entry
    });

    it('wraps wordsOfJesus fragments in a usfm:wj span', () => {
        const doc = helloaoChapterToSofria({
            chapter: {
                number: 1,
                content: [
                    { type: 'verse', number: 1, content: [{ text: 'Follow Me.', wordsOfJesus: true }] },
                ],
            },
        });
        const rendered = renderSofria(doc);
        expect(rendered.html).toContain('<span class="wj">Follow Me.</span>');
    });

    it('still emits a footnote caller when the noteId has no matching footnote entry', () => {
        const doc = helloaoChapterToSofria({
            chapter: {
                number: 1,
                content: [{ type: 'verse', number: 1, content: ['Text', { noteId: 999 }] }],
                footnotes: [],
            },
        });
        const rendered = renderSofria(doc);
        expect(rendered.html).toContain('data-note-idx="0"');
        expect(rendered.footnotes[0].html).toBe('');
    });

    it('skips a verse item with no number', () => {
        const doc = helloaoChapterToSofria({
            chapter: {
                number: 1,
                content: [{ type: 'verse', content: ['orphan'] } as any],
            },
        });
        expect(extractVersesFromSofria(doc)).toEqual([]);
    });
});

describe('flatVersesToSofria (DBT / openbible)', () => {
    it('round-trips through extractVersesFromSofria unchanged (whitespace-normalised)', () => {
        const input = [
            { num: 1, text: 'a' },
            { num: 2, text: '  b  ' },
            { num: 3, text: 'c & <d>' },
        ];
        const doc = flatVersesToSofria(input);
        expect(extractVersesFromSofria(doc)).toEqual([
            { num: 1, text: 'a' },
            { num: 2, text: 'b' },
            { num: 3, text: 'c & <d>' },
        ]);
    });

    it('renders one paragraph with one verse-block per verse, HTML-escaped', () => {
        const doc = flatVersesToSofria([{ num: 1, text: 'a & <b>' }]);
        const rendered = renderSofria(doc);
        expect(verseBlockCount(rendered.html)).toBe(1);
        expect(rendered.html).toContain('a &amp; &lt;b&gt;');
        expect(rendered.html).not.toContain('usfm-p');
    });

    it('sorts by verse number regardless of input order', () => {
        const doc = flatVersesToSofria([
            { num: 2, text: 'second' },
            { num: 1, text: 'first' },
        ]);
        expect(extractVersesFromSofria(doc).map((v) => v.num)).toEqual([1, 2]);
    });

    it('renders nothing for empty input', () => {
        const rendered = renderSofria(flatVersesToSofria([]));
        expect(rendered.html).toBe('');
    });
});
