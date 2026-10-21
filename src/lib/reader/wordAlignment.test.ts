import { afterEach, describe, expect, it, vi } from 'vitest';
import {
    alignVerseTokens,
    chapterFingerprint,
    decodeSourceKey,
    decodeSpan,
    displayPieces,
    FN_ORDINAL_BASE,
    getChapterAlignment,
    layerCredit,
    parseCompactString,
    parseFingerprints,
    sourceKey,
    tokensForVerse,
    verseHasOrdinal
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

describe('alignment strings (compact and full-alignment layers)', () => {
    it('decodes every span form; ! and ~ give no positions', () => {
        expect(decodeSpan('5')).toEqual([5]);
        expect(decodeSpan('5-7')).toEqual([5, 6, 7]);
        expect(decodeSpan('5,9')).toEqual([5, 9]);
        expect(decodeSpan('1,4-5')).toEqual([1, 4, 5]);
        expect(decodeSpan('L3,1,2')).toEqual([3, 1, 2]);
        expect(decodeSpan('!')).toEqual([]);
        expect(decodeSpan('~')).toEqual([]);
    });

    it('keeps only links, skipping decision-list entries', () => {
        // JHN 3:16 fn channel of eng_BSB+manual+bsb-tables, and a main string with a list entry
        expect([...parseCompactString('0:2 1:0 3:4 !5 u2@0,6@9 +1>5,10')]).toEqual([[0, '2'], [1, '0'], [3, '4']]);
        expect([...parseCompactString('0:24 1:19-23 e6')]).toEqual([[0, '24'], [1, '19-23']]);
    });

    it('aligns function words in their own ordinal range', () => {
        const map = alignVerseTokens(43, 3, 16, { compact: '0:3 4:10-12', fn: '0:2 !5' }, 30);
        expect(map.get(3)).toEqual([sourceKey(43, 3, 16, 0)]);
        expect(map.get(11)).toEqual([sourceKey(43, 3, 16, 4)]);
        expect(map.get(2)).toEqual([sourceKey(43, 3, 16, FN_ORDINAL_BASE)]);
        expect(decodeSourceKey(sourceKey(43, 3, 16, FN_ORDINAL_BASE + 12))).toEqual({ bookId: 43, chapter: 3, verse: 16, ordinal: FN_ORDINAL_BASE + 12 });
        expect(verseHasOrdinal({ compact: '0:3', fn: '2:7' }, FN_ORDINAL_BASE + 2)).toBe(true);
        expect(verseHasOrdinal({ compact: '0:3', fn: '2:7' }, 2)).toBe(false);
    });

    it('credits a layer with its licence', () => {
        expect(layerCredit({ id: 'x', kind: 'manual', source: 'clear', license: 'CC-BY-4.0' })).toBe('Clear Bible (CC BY 4.0)');
        expect(layerCredit({ id: 'x', kind: 'manual', source: 'door43', license: 'CC-BY-SA-4.0' })).toBe('unfoldingWord® / Door43 contributors (CC BY-SA 4.0)');
        expect(layerCredit({ id: 'x', kind: 'manual', source: 'bsb-tables', license: 'CC0-1.0' })).toBe('Berean Standard Bible translation tables (CC0 1.0)');
        expect(layerCredit({ id: 'x', kind: 'manual', source: 'sword', license: 'Public Domain' })).toBe('SWORD');
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
        expect(al?.verses.get(1)).toEqual({ compact: '0:1' });
        expect(al?.verses.get(2)).toEqual({ compact: '1:0' });
        expect(al?.layer).toBeNull();
        // one fingerprint file for the whole language, no folder listing
        expect(calls.filter((u) => u.includes('_fingerprints.txt'))).toHaveLength(1);
        expect(calls.some((u) => u.includes('/api/'))).toBe(false);
    });

    it('lets the source edition decide when several editions have our text', async () => {
        stubHub('frb', '0848e', '0848e');
        expect((await getChapterAlignment('frb', lsg, 'lsg', 64, 1))?.verses.get(1)).toEqual({ compact: '0:1' });
    });

    it('gives nothing for a language without alignments (404)', async () => {
        stubHub('frd', '0848e');
        expect(await getChapterAlignment('xyz', lsg, null, 64, 1)).toBeNull();
    });

    it('prefers a full-alignment layer of exactly that file, CC0 before CC BY', async () => {
        stubHub('frf', '0848e');
        const stubbed = globalThis.fetch;
        const calls: string[] = [];
        const layer = (license: string, books: Record<string, string>) => ({ edition: 'frf_lsg', source: license === 'CC0-1.0' ? 'bsb-tables' : 'clear', license, books });
        vi.stubGlobal('fetch', async (url: string) => {
            calls.push(url);
            const ok = (body: unknown) => ({ ok: true, json: async () => body });
            if (url.includes('full-alignments-manual/resolve/main/manifest.json'))
                return ok({
                    languages: {
                        frf: {
                            layers: {
                                'frf_lsg+manual+clear': layer('CC-BY-4.0', { '3JN': '3JN_6e149a85.json' }),
                                'frf_lsg+manual+tables': layer('CC0-1.0', { '3JN': '3JN_6e149a85.json' }),
                                'frf_lsg+manual+old': layer('CC0-1.0', { '3JN': '3JN_00000000.json' })
                            }
                        }
                    }
                });
            if (url.endsWith('/f/frf/frf_lsg+manual+tables/3JN_6e149a85.json')) return ok(['0:1-2', '1:0']);
            if (url.endsWith('/f/frf/frf_lsg+manual+tables/3JN_6e149a85.meta.json')) return ok({ fn: ['0:3 !1', ''] });
            return stubbed(url);
        });
        vi.resetModules(); // earlier tests cached "no manifest"
        const fresh = await import('./wordAlignment');
        const al = await fresh.getChapterAlignment('frf', lsg, null, 64, 1);
        expect(al?.layer).toEqual({ id: 'frf_lsg+manual+tables', kind: 'manual', source: 'bsb-tables', license: 'CC0-1.0' });
        expect(al?.verses.get(1)).toEqual({ compact: '0:1-2', fn: '0:3 !1' });
        expect(al?.verses.get(2)).toEqual({ compact: '1:0' });
        expect(calls.some((u) => u.includes('/f/frf/frf_lsg/3JN_'))).toBe(false); // the statistical file isn't needed
    });

    it('uses an edition that only has a full-alignment layer ("<dataset>/<layer id>" line)', async () => {
        vi.resetModules();
        const fresh = await import('./wordAlignment');
        const layerId = 'frg_glt+manual+door43';
        const manifest = (books: Record<string, string>) => ({
            languages: { frg: { layers: { [layerId]: { edition: 'frg_glt', source: 'door43', license: 'CC-BY-SA-4.0', books } } } }
        });
        const run = async (books: Record<string, string>, dataset = 'full-alignments-manual-sa') => {
            vi.stubGlobal('fetch', async (url: string) => {
                const ok = (body: unknown) => ({ ok: true, json: async () => body, text: async () => String(body) });
                if (url.endsWith('/f/frg/_fingerprints.txt')) return ok(`${dataset}/${layerId} 3JN 6e149a85 2026-10-16 0848e\n`);
                if (url.endsWith('/_index/3JN_lexemes.json')) return ok({ '3JN 1:1': [], '3JN 1:2': [] });
                if (url.includes(`/bcv-commons/${dataset}/resolve/main/manifest.json`)) return ok(manifest(books));
                if (url.endsWith(`/${dataset}/resolve/main/f/frg/${layerId}/3JN_6e149a85.json`)) return ok(['0:1', '1:0']);
                if (url.endsWith(`/${dataset}/resolve/main/f/frg/${layerId}/3JN_6e149a85.meta.json`)) return ok({ fn: null });
                return { ok: false };
            });
            return fresh.getChapterAlignment('frg', lsg, null, 64, 1);
        };
        const al = await run({ '3JN': '3JN_6e149a85.json' });
        expect(al?.edition).toBe('frg_glt');
        expect(al?.layer).toEqual({ id: layerId, kind: 'manual', source: 'door43', license: 'CC-BY-SA-4.0' });
        expect(al?.verses.get(1)).toEqual({ compact: '0:1' });
    });

    it('ignores a layer-only line from a dataset we do not use', async () => {
        vi.resetModules();
        const fresh = await import('./wordAlignment');
        vi.stubGlobal('fetch', async (url: string) => {
            const ok = (body: unknown) => ({ ok: true, json: async () => body, text: async () => String(body) });
            if (url.endsWith('/f/frh/_fingerprints.txt')) return ok('some-other-dataset/x+manual+y 3JN 6e149a85 2026-10-16 0848e\n');
            return { ok: false };
        });
        expect(await fresh.getChapterAlignment('frh', lsg, null, 64, 1)).toBeNull();
    });

    it('gives nothing when no edition has exactly our text', async () => {
        stubHub('frc', 'fffff');
        expect(await getChapterAlignment('frc', lsg, 'lsg', 64, 1)).toBeNull();
    });
});
