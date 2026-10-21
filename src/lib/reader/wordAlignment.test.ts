import { afterEach, describe, expect, it, vi } from 'vitest';
import {
    chapterFingerprint,
    displayPieces,
    getChapterAlignment,
    parseFingerprints,
    tokensForVerse
} from './wordAlignment';
import { chapterVerses } from '../sofria';
import { helloaoToSofria } from '../sofria/convert';
import { LSG_3JN_1 } from '../sofria/__fixtures__/helloao';

const lsg = chapterVerses(helloaoToSofria(LSG_3JN_1, '3JN', { lang: 'fra', abbr: 'fra_lsg' }));

describe('chapterFingerprint', () => {
    it("matches compact-alignments' reference digest (fra_lsg 3JN 1: 0848eefc…)", async () => {
        expect(await chapterFingerprint(1, lsg)).toBe('0848e');
    });

    it('changes with a single word', async () => {
        const edited = lsg.map((v) => (v.num === 1 ? { ...v, text: v.text.replace('ancien', 'aîné') } : v));
        expect(edited[0].text).toContain('aîné');
        expect(await chapterFingerprint(1, edited)).not.toBe('0848e');
    });

    it('counts a range verse under its first number, and ignores punctuation and digits', async () => {
        const a = [{ label: '4-5', num: 4, text: 'Un, deux 12 trois.' }];
        const b = [{ label: '4', num: 4, text: 'un deux trois' }];
        expect(await chapterFingerprint(2, a)).not.toBe(await chapterFingerprint(2, b)); // case matters
        const c = [{ label: '4', num: 4, text: 'Un deux trois' }];
        expect(await chapterFingerprint(2, a)).toBe(await chapterFingerprint(2, c));
    });

    it('is null for a chapter with no tokens', async () => {
        expect(await chapterFingerprint(1, [{ label: '1', num: 1, text: '12 —' }])).toBeNull();
    });
});

describe('parseFingerprints', () => {
    it('reads file hash and chapter fingerprints, "n:" restarting the sequence', () => {
        const editions = parseFingerprints(
            'eng_BSB RUT 44f46079 2026-10-12 262a1 8a8c3 ccd3c 8f71d\neng_BSB JOL abcdef12 2026-10-12 aaaaa 3:bbbbb ccccc\nENGWEB RUT 11111111 2026-10-14 99999\n'
        );
        expect([...editions.keys()]).toEqual(['eng_BSB', 'ENGWEB']);
        const books = editions.get('eng_BSB')!;
        expect(books.get('RUT')).toEqual({
            fileHash: '44f46079',
            chapters: new Map([[1, '262a1'], [2, '8a8c3'], [3, 'ccd3c'], [4, '8f71d']])
        });
        expect([...books.get('JOL')!.chapters]).toEqual([[1, 'aaaaa'], [3, 'bbbbb'], [4, 'ccccc']]);
    });
});

describe('displayPieces / tokensForVerse (tokenizer v2 positions)', () => {
    it('rejoins to the text; punctuation, digits and spaces carry no token', () => {
        const pieces = displayPieces('Jésus dit: 3 fois «non».');
        expect(pieces.map((p) => p.text).join('')).toBe('Jésus dit: 3 fois «non».');
        expect(pieces.filter((p) => p.tokens.length).map((p) => [p.text, p.tokens])).toEqual([
            ['Jésus', [0]],
            ['dit', [1]],
            ['fois', [2]],
            ['non', [3]]
        ]);
    });

    it('splits Han text one piece per character, as the tokenizer counts it', () => {
        const pieces = displayPieces('神爱世人。');
        expect(pieces.map((p) => [p.text, p.tokens])).toEqual([
            ['神', [0]],
            ['爱', [1]],
            ['世', [2]],
            ['人', [3]],
            ['。', []]
        ]);
    });

    it('keeps combining marks in the displayed word (stripped only for counting)', () => {
        const text = 'בְּרֵאשִׁית בָּרָא';
        const pieces = displayPieces(text);
        expect(pieces.map((p) => p.text).join('')).toBe(text.normalize('NFC'));
        expect(pieces.filter((p) => p.tokens.length).map((p) => p.tokens)).toEqual([[0], [1]]);
    });

    it('marks pieces whose tokens are aligned', () => {
        const out = tokensForVerse('a b c', new Map([[1, [42]]]));
        expect(out.map((t) => t.wordIds)).toEqual([null, null, [42], null, null]);
    });
});

describe('getChapterAlignment (verified edition lookup)', () => {
    afterEach(() => vi.unstubAllGlobals());

    // Book 64 = 3JN. Two editions; only <iso>_lsg's published chapter 1 is
    // `lsgFp`. A different iso per test: the module caches per language.
    function stubHub(iso: string, lsgFp: string, otherFp = '99999') {
        const calls: string[] = [];
        vi.stubGlobal('fetch', async (url: string) => {
            calls.push(url);
            const ok = (body: unknown) => ({ ok: true, json: async () => body, text: async () => String(body) });
            const dir = `f/${iso}`;
            if (url.endsWith(`/${dir}/_fingerprints.txt`))
                return ok(`${iso}_other 3JN 11111111 2026-10-12 ${otherFp}\n${iso}_lsg 3JN 6e149a85 2026-10-12 ${lsgFp}\n`);
            if (url.endsWith('/_index/3JN_lexemes.json')) return ok({ '3JN 1:1': [], '3JN 1:2': [] });
            if (url.endsWith(`/${dir}/${iso}_lsg/3JN_6e149a85.json`)) return ok(['0:1', '1:0']);
            if (url.endsWith(`/${dir}/${iso}_other/3JN_11111111.json`)) return ok(['9:9', '9:9']);
            return { ok: false };
        });
        return calls;
    }

    it('uses the edition whose published chapter fingerprint equals ours', async () => {
        const calls = stubHub('fra', '0848e');
        const al = await getChapterAlignment('fra', lsg, null, 64, 1);
        expect(al?.get(1)).toEqual({ compact: '0:1' });
        expect(al?.get(2)).toEqual({ compact: '1:0' });
        // one fingerprint file for the whole language, no folder listing
        expect(calls.filter((u) => u.includes('_fingerprints.txt'))).toHaveLength(1);
        expect(calls.some((u) => u.includes('/api/'))).toBe(false);
    });

    it('lets the source edition decide when several editions have our text', async () => {
        stubHub('frb', '0848e', '0848e');
        expect((await getChapterAlignment('frb', lsg, 'lsg', 64, 1))?.get(1)).toEqual({ compact: '0:1' });
    });

    it('gives nothing for a language without alignments (404)', async () => {
        stubHub('frd', '0848e');
        expect(await getChapterAlignment('xyz', lsg, null, 64, 1)).toBeNull();
    });

    it('gives nothing when no edition has exactly our text', async () => {
        stubHub('frc', 'fffff');
        expect(await getChapterAlignment('frc', lsg, 'lsg', 64, 1)).toBeNull();
    });
});
