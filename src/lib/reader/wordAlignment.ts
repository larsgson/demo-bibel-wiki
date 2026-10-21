/**
 * Word-level alignment between two translations' own texts — ported from
 * example/interlinear/web-app's src/lib/server/compactAlignments.ts +
 * src/lib/server/alignment.ts, merged into one client-side module (the
 * source dataset is public static JSON on the Hugging Face Hub, fetchable
 * with plain `fetch` — no server/SDK needed, so this runs the same in a
 * static-output Astro build the example app's own SvelteKit server route
 * did) and reworked to drop shoresh as a dependency (see below).
 *
 * Drives the parallel view's "hover a word, see its aligned counterpart
 * highlighted in the other panel" feature. Data coverage caveat (inherited
 * unchanged from the example app): only ~200 of ~1256 known translation
 * editions currently have a published compact-alignments edition — every
 * lookup here degrades to `null`/no-highlight rather than an error when a
 * translation isn't covered, by design.
 *
 * Which edition's alignment belongs to the text on screen is VERIFIED, never
 * guessed: alignment positions index the exact tokens of one text, so an
 * alignment computed for a different edition (or an older printing of the
 * same one) produces confident-looking but WRONG matches. compact-alignments
 * names each book file by a fingerprint of its text (README "The text
 * fingerprint", text fingerprint v1 on tokenizer v2 — bibles' verse-text tools,
 * vendored under ../sofria/vendor/verse-text), and publishes per language
 * every edition's latest chapter fingerprints (`<l>/<iso>/_fingerprints.txt`
 * in compact-alignments-meta). So: fingerprint the displayed chapter from the
 * same verse text the panel shows (`chapterVerses`, bibles' extraction rule),
 * and use the edition whose published fingerprint for this book/chapter is
 * the same — the source's own edition id (helloAO/DBT id, PKF docSet such as
 * `ind_C01`) only breaks a tie. No match: no alignment, plain text.
 *
 * Deliberately shoresh-free: the example app matched translation tokens to
 * shoresh's own Hebrew/Greek word ids by walking both word lists in lockstep
 * and comparing Strong's numbers, all-or-nothing per verse on any mismatch —
 * fragile, since shoresh isn't the same pipeline compact-alignments' own
 * lexemes.json was built against, and a single mismatched word blanked out
 * an entire verse for BOTH panels. That reconciliation step was never
 * actually necessary: every edition's `compact` string already references
 * positions in the SAME shared per-book lexemes.json, so two independent
 * editions' `srcOrdinal`s for one verse are already directly comparable —
 * `sourceKey()` below just packages (book, chapter, verse, ordinal) as the
 * shared match key, no shoresh reconciliation required. Shoresh now only
 * powers the optional "Original" text panel (ParallelView.svelte's own
 * left-language choice), plus — see `matchOriginalWordAtOrdinal` below —
 * showing which original word a CLICKED highlighted token aligns to. That
 * click path still does a scoped, single-verse version of the old Strong's-
 * number walk, but only on demand for the one verse clicked, so a mismatch
 * there just means "no original word shown for this click", never the
 * wider hover-highlight breakage the old always-on version risked. Once
 * shoresh grows a real per-word lexicon endpoint (not built yet — see
 * shoresh.ts's header comment), clicking can additionally fetch grammar/
 * gloss detail for the word this resolves to.
 */

import { getBookById, type Book } from '../bw/bible-books';
import type { ChapterVerse } from '../sofria';
import { tokenize } from '../sofria/vendor/verse-text/tokenize.js';
import { fingerprints } from '../sofria/vendor/verse-text/text_fingerprint.mjs';

export { tokenize };

const HF_BASE_URL = 'https://huggingface.co/datasets/bcv-commons/compact-alignments/resolve/main';
const HF_META_URL = 'https://huggingface.co/datasets/bcv-commons/compact-alignments-meta/resolve/main';
/** Full-alignment datasets, best first: hand-made (the share-alike Door43
 *  layers are a dataset of their own), then model-checked. Same paths and
 *  file names as compact-alignments (a layer folder per edition). Licences
 *  needing attribution are credited in the parallel view (layerCredit). */
const FULL_LAYER_DATASETS = [
    'https://huggingface.co/datasets/bcv-commons/full-alignments-manual/resolve/main',
    'https://huggingface.co/datasets/bcv-commons/full-alignments-manual-sa/resolve/main',
    'https://huggingface.co/datasets/bcv-commons/full-alignments-llm/resolve/main'
];
/** Hex digits of a chapter fingerprint in `_fingerprints.txt`. */
const CHAPTER_FP_HEX = 5;

/** Function-word ordinals (`_index/<BOOK>_fn.json`, full-alignment layers'
 *  `fn` channel) share one ordinal space with content ordinals, offset by this. */
export const FN_ORDINAL_BASE = 500;

/** A stable key for one source-word slot in a specific verse — a position in
 *  the published `_index/` sequence (content ordinal, or FN_ORDINAL_BASE +
 *  function-word ordinal), not a shoresh word id. */
export function sourceKey(bookId: number, chapter: number, verse: number, ordinal: number): number {
    return bookId * 1_000_000_000 + chapter * 1_000_000 + verse * 1000 + ordinal;
}

export function verseOfSourceKey(key: number): number {
    return Math.floor(key / 1000) % 1000;
}

export interface SourceKeyRef {
    bookId: number;
    chapter: number;
    verse: number;
    ordinal: number;
}

export function decodeSourceKey(key: number): SourceKeyRef {
    return {
        bookId: Math.floor(key / 1_000_000_000),
        chapter: Math.floor(key / 1_000_000) % 1000,
        verse: Math.floor(key / 1000) % 1000,
        ordinal: key % 1000
    };
}

const cachedFetch = <T>(cache: Map<string, Promise<T | null>>, key: string, load: () => Promise<T | null>) => {
    let p = cache.get(key);
    if (!p) {
        p = load().catch(() => null);
        cache.set(key, p);
    }
    return p;
};

/** One book's line in a `_fingerprints.txt`: the latest version's file hash
 *  and its chapter fingerprints (first 5 hex). */
export interface BookFingerprints {
    fileHash: string;
    chapters: Map<number, string>;
}

/** edition folder ("eng_BSB", "INDTSI", …) -> book code -> its fingerprints. */
export type LanguageFingerprints = Map<string, Map<string, BookFingerprints>>;

/** Parse a language's `_fingerprints.txt`: "<edition> <BOOK> <file hash>
 *  <date> <chapter fp>…", the chapter fingerprints in chapter order, "n:xxxxx"
 *  where the sequence breaks. */
export function parseFingerprints(text: string): LanguageFingerprints {
    const editions: LanguageFingerprints = new Map();
    for (const line of text.split('\n')) {
        const [edition, book, fileHash, _date, ...fps] = line.trim().split(/\s+/);
        if (!edition || !book || !fileHash) continue;
        const chapters = new Map<number, string>();
        let chapter = 0;
        for (const fp of fps) {
            const [n, hex] = fp.includes(':') ? fp.split(':') : [String(chapter + 1), fp];
            chapter = Number(n);
            chapters.set(chapter, hex);
        }
        if (!editions.has(edition)) editions.set(edition, new Map());
        editions.get(edition)!.set(book, { fileHash, chapters });
    }
    return editions;
}

/** Every edition's fingerprints for one language, in one file; null (404)
 *  when the language has no alignments. */
const fingerprintsCache = new Map<string, Promise<LanguageFingerprints | null>>();
function languageFingerprints(iso: string): Promise<LanguageFingerprints | null> {
    return cachedFetch(fingerprintsCache, iso, async () => {
        const response = await fetch(`${HF_META_URL}/${iso[0]}/${iso}/_fingerprints.txt`);
        return response.ok ? parseFingerprints(await response.text()) : null;
    });
}

/** The chapter fingerprint (first 5 hex) of the verses a panel shows: verse
 *  text by its first verse number (a "2-3" range counts under 2), tokenized
 *  with tokenizer v2 — the same definition compact-alignments publishes.
 *  Null when the chapter has no tokens at all. */
export async function chapterFingerprint(chapter: number, verses: ChapterVerse[]): Promise<string | null> {
    const byVerse = new Map<string, string>();
    for (const v of verses) {
        if (v.num == null) continue;
        const key = `${chapter}:${v.num}`;
        const prev = byVerse.get(key);
        byVerse.set(key, prev ? `${prev} ${v.text}` : v.text);
    }
    const { chapters } = await fingerprints(byVerse);
    return chapters[chapter]?.slice(0, CHAPTER_FP_HEX) ?? null;
}

/** The edition (and its book file name) whose latest published text of this
 *  chapter is exactly ours, or null. When several editions have the same
 *  text, `hint` — the source's own edition id — decides. */
async function findAlignedEdition(
    iso: string,
    bookCode: string,
    chapter: number,
    fp: string,
    hint: string | null
): Promise<{ edition: string; file: string } | null> {
    const editions = await languageFingerprints(iso);
    if (!editions) return null;
    const matching: Array<{ edition: string; file: string }> = [];
    for (const [edition, books] of editions) {
        const book = books.get(bookCode);
        if (book?.chapters.get(chapter) === fp) matching.push({ edition, file: `${bookCode}_${book.fileHash}.json` });
    }
    return matching.find((m) => hint && (m.edition === hint || m.edition === `${iso}_${hint}`)) ?? matching[0] ?? null;
}

// verse ref ("BOOK C:V") -> ordered lexeme-number array, published once per
// book and shared by every language/edition that aligns to it — cached by
// book only, never by language.
// `_index/<BOOK>_lexemes.json` (content words) and `_fn.json` (function
// words): verse ref -> the source words' Strong's numbers, in ordinal order.
const indexCache = new Map<string, Promise<Record<string, string[]> | null>>();
function getBookIndex(bookCode: string, kind: 'lexemes' | 'fn'): Promise<Record<string, string[]> | null> {
    return cachedFetch(indexCache, `${bookCode}_${kind}`, async () => {
        const response = await fetch(`${HF_BASE_URL}/_index/${bookCode}_${kind}.json`);
        return response.ok ? response.json() : null;
    });
}
const getBookLexemes = (bookCode: string) => getBookIndex(bookCode, 'lexemes');

/** One verse's ordered lexeme-code sequence (e.g. ["H1254a", "H853", ...]) —
 *  reuses the whole-book cache, so this is free after the first call for any
 *  verse in that book. `fn`: the function words' sequence instead. */
export async function getVerseLexemes(bookCode: string, chapter: number, verse: number, fn = false): Promise<string[] | null> {
    const lexemesByRef = await getBookIndex(bookCode, fn ? 'fn' : 'lexemes');
    return lexemesByRef?.[`${bookCode} ${chapter}:${verse}`] ?? null;
}

const jsonCache = new Map<string, Promise<any>>();
const fetchJson = (url: string) =>
    cachedFetch(jsonCache, url, async () => {
        const response = await fetch(url);
        return response.ok ? response.json() : null;
    });

/** A full-alignment layer of an edition (`<edition>+manual+clear`, …). */
export interface AlignmentLayer {
    id: string;
    /** "manual" (made by people) or "llm" (model-checked). */
    kind: 'manual' | 'llm';
    /** Who made it: "clear", "bsb-tables", "helfi", "sword", or the model. */
    source: string;
    license: string | null;
}

interface LayerManifestEntry {
    books: Record<string, string>;
    edition: string;
    license?: string | null;
    source: string;
}

const OPEN_LICENSES = new Set(['CC0-1.0', 'Public Domain']);

/** The best full-alignment layer built on exactly this book file of `edition`
 *  (the manifest names the same `<BOOK>_<hash>.json`), with its dataset URL. */
async function findFullLayer(
    iso: string,
    edition: string,
    file: string,
    bookCode: string
): Promise<{ base: string; layer: AlignmentLayer } | null> {
    for (const base of FULL_LAYER_DATASETS) {
        const manifest = await fetchJson(`${base}/manifest.json`);
        const layers = Object.entries<LayerManifestEntry>(manifest?.languages?.[iso]?.layers ?? {})
            .filter(([, l]) => l.edition === edition && l.books?.[bookCode] === file)
            // Public-domain and CC0 layers first: nothing to attribute.
            .sort(([, a], [, b]) => Number(OPEN_LICENSES.has(b.license ?? '')) - Number(OPEN_LICENSES.has(a.license ?? '')));
        if (layers.length) {
            const [id, l] = layers[0];
            return { base, layer: { id, kind: id.includes('+llm+') ? 'llm' : 'manual', source: l.source, license: l.license ?? null } };
        }
    }
    return null;
}

const LAYER_SOURCES: Record<string, string> = {
    clear: 'Clear Bible',
    'bsb-tables': 'Berean Standard Bible translation tables',
    helfi: 'HELFI, University of Helsinki',
    sword: 'SWORD',
    door43: 'unfoldingWord® / Door43 contributors'
};

/** Who made a layer, with its licence: the credit a CC BY layer requires. */
export function layerCredit(layer: AlignmentLayer): string {
    const who = LAYER_SOURCES[layer.source] ?? layer.source;
    // "CC-BY-SA-4.0" -> "CC BY-SA 4.0"
    const name = layer.license?.replace(/^CC-/, 'CC ').replace(/-(\d)/, ' $1');
    const license = name && layer.license !== 'Public Domain' ? ` (${name})` : '';
    return layer.kind === 'llm' ? `${who}, model-checked` : `${who}${license}`;
}

export interface VerseAlignment {
    /** Content words: "srcOrdinal:targetSpan ..." for this verse (may be ""). */
    compact: string;
    /** Function words (full-alignment layers only): "fnOrdinal:targetSpan ...". */
    fn?: string;
}

export interface ChapterAlignment {
    verses: Map<number, VerseAlignment>;
    edition: string;
    /** The full-alignment layer used, or null for the statistical compact file. */
    layer: AlignmentLayer | null;
}

/**
 * One chapter's alignment strings for the text a panel shows, keyed by verse
 * number — only when a published edition's text of this chapter is verified
 * identical to `verses` (see the module doc); null otherwise, and callers
 * render plain, unaligned text. `hint` is the source's own edition id
 * (chapter-doc's `getChapterSource().id`), which breaks ties.
 *
 * A full alignment of that same text (every word, function words included;
 * hand-made where one exists) replaces the statistical compact file: same
 * format, same file name, function words in its `.meta.json` `fn` channel.
 *
 * `_index/{book}_lexemes.json` is fetched only to learn the ORDER of verse
 * refs (the position that lines each verse up with its entry in the file).
 */
export async function getChapterAlignment(
    iso: string,
    verses: ChapterVerse[],
    hint: string | null,
    bookId: number,
    chapter: number
): Promise<ChapterAlignment | null> {
    const book: Book | undefined = getBookById(bookId);
    if (!book) return null;
    const bookCode = book.code;

    const fp = await chapterFingerprint(chapter, verses);
    if (!fp) return null;
    const found = await findAlignedEdition(iso, bookCode, chapter, fp, hint);
    if (!found) return null;

    const full = await findFullLayer(iso, found.edition, found.file, bookCode).catch(() => null);
    const folder = full
        ? `${full.base}/${iso[0]}/${iso}/${full.layer.id}`
        : `${HF_BASE_URL}/${iso[0]}/${iso}/${found.edition}`;
    const [verseRefIndex, main, meta] = await Promise.all([
        getBookLexemes(bookCode),
        fetchJson(`${folder}/${found.file}`) as Promise<string[] | null>,
        full ? (fetchJson(`${folder}/${found.file.replace(/\.json$/, '.meta.json')}`) as Promise<{ fn?: string[] | null } | null>) : null
    ]);
    if (!verseRefIndex || !main) return null;

    const refs = Object.keys(verseRefIndex);
    const result = new Map<number, VerseAlignment>();
    for (let i = 0; i < refs.length; i++) {
        const match = /^\S+ (\d+):(\d+)$/.exec(refs[i]);
        if (!match || Number(match[1]) !== chapter) continue;
        const fn = meta?.fn?.[i];
        result.set(Number(match[2]), fn ? { compact: main[i] ?? '', fn } : { compact: main[i] ?? '' });
    }
    return { verses: result, edition: found.edition, layer: full?.layer ?? null };
}

/**
 * A verse's text as display pieces, in order (rejoined they give the text
 * back), each with the target-token positions it covers — positions as
 * compact-alignments counts them: tokenizer v2 (`tokenize`, vendored), where
 * a token is a run of letters/marks with combining marks stripped, and
 * unspaced scripts are split further (Han per character, Japanese at kana/
 * script boundaries, Myanmar per syllable). Such a split run is shown as one
 * piece per token; punctuation, digits and spaces are pieces with no token.
 */
export function displayPieces(text: string): Array<{ text: string; tokens: number[] }> {
    const out: Array<{ text: string; tokens: number[] }> = [];
    let next = 0;
    for (const run of text.normalize('NFC').match(/[\p{L}\p{M}]+|[^\p{L}\p{M}]+/gu) ?? []) {
        const toks = /[\p{L}\p{M}]/u.test(run) ? tokenize(run) : [];
        if (toks.length > 1 && toks.join('') === run) {
            for (const t of toks) out.push({ text: t, tokens: [next++] });
        } else {
            out.push({ text: run, tokens: toks.map(() => next++) });
        }
    }
    return out;
}

/** Target positions of a span: `5`, `5-7`, `5,9`, `1,4-5`, an ordered list
 *  `L3,1,2`; `!` (explicitly no target word) and `~` (unplaced) give none. */
export function decodeSpan(span: string): number[] {
    const out: number[] = [];
    for (const part of span.replace(/^L/, '').split(',')) {
        const m = /^(\d+)(?:-(\d+))?$/.exec(part);
        if (!m) continue;
        const lo = Number(m[1]);
        const hi = m[2] === undefined ? lo : Number(m[2]);
        for (let i = lo; i <= hi; i++) out.push(i);
    }
    return out;
}

/** The links of one alignment string, source ordinal -> span. Other entries of
 *  full-alignment decision lists (`!6`, `u9@10`, `e6`, `+1>5`) are skipped. */
export function parseCompactString(compact: string): Map<number, string> {
    const pairs = new Map<number, string>();
    if (!compact) return pairs;
    for (const part of compact.split(' ')) {
        const m = /^(\d+):(.+)$/.exec(part);
        if (m) pairs.set(Number(m[1]), m[2]);
    }
    return pairs;
}

/**
 * Whether a verse's own `compact` string has an entry for `ordinal` — i.e.
 * whether THIS edition aligns that particular original-language word to
 * anything at all. Both sides of a comparison reference the exact same
 * per-verse ordinal sequence (the shared lexemes.json), so this single
 * membership check is the whole cross-panel confirmation: given the ordinal
 * a hovered token aligns to on one side, checking the OTHER side's compact
 * string for that same ordinal is both necessary and sufficient — no need
 * to rebuild or scan the other side's rendered tokens at all.
 */
export function compactHasOrdinal(compact: string, ordinal: number): boolean {
    return parseCompactString(compact).has(ordinal);
}

/** compactHasOrdinal over a verse's content and function-word strings. */
export function verseHasOrdinal(alignment: VerseAlignment | undefined, ordinal: number): boolean {
    if (!alignment) return false;
    return ordinal >= FN_ORDINAL_BASE
        ? !!alignment.fn && compactHasOrdinal(alignment.fn, ordinal - FN_ORDINAL_BASE)
        : compactHasOrdinal(alignment.compact, ordinal);
}

/**
 * Aligns one verse's target-language tokens to `sourceKey`s — purely from
 * the edition's own `compact` string, no shoresh/original-word lookup
 * involved (see module doc comment). Returns a map of target token index ->
 * the source key(s) aligned to it (only tokens with at least one alignment
 * appear). Out-of-bounds target spans (e.g. a translation edited since the
 * alignment was published) are skipped one-by-one, not treated as a reason
 * to abandon the whole verse — unlike the old shoresh-reconciliation
 * approach, nothing here can fail for the whole verse at once.
 */
export function alignVerseTokens(
    bookId: number,
    chapter: number,
    verse: number,
    alignment: VerseAlignment,
    targetTokenCount: number
): Map<number, number[]> {
    const result = new Map<number, number[]>();
    const add = (compact: string, base: number) => {
        for (const [ordinal, span] of parseCompactString(compact)) {
            const indices = decodeSpan(span);
            if (indices.some((i) => i < 0 || i >= targetTokenCount)) continue;
            const key = sourceKey(bookId, chapter, verse, base + ordinal);
            for (const i of indices) {
                const existing = result.get(i);
                if (existing) existing.push(key);
                else result.set(i, [key]);
            }
        }
    };
    add(alignment.compact, 0);
    if (alignment.fn) add(alignment.fn, FN_ORDINAL_BASE);
    return result;
}

export interface DisplayToken {
    text: string;
    wordIds: number[] | null;
}

/** Combines displayPieces + alignVerseTokens' result into the ordered
 *  render-ready piece list for one verse: every piece carries its text, and
 *  a piece covering aligned tokens carries their word ids. */
export function tokensForVerse(verseText: string, verseAlignment: Map<number, number[]>): DisplayToken[] {
    return displayPieces(verseText).map(({ text, tokens }) => {
        const ids = tokens.flatMap((i) => verseAlignment.get(i) ?? []);
        return { text, wordIds: ids.length ? [...new Set(ids)] : null };
    });
}

/** Minimal shape this needs from a shoresh word — kept structural (not
 *  imported from shoresh.ts) so this module stays free of a shoresh
 *  dependency for everything EXCEPT this one on-click lookup. */
export interface OriginalWordLike {
    id: number;
    text: string;
    strongsCode: string | null;
}

/** Strips the H/G testament letter and any trailing lowercase sense-split
 *  letter from a Strong's-style code so it can be compared purely by lexeme
 *  number (e.g. "H1254a" -> 1254, "G3588" -> 3588, "6960a" -> 6960). */
function normalizeLexemeNumber(code: string): number {
    return parseInt(code.replace(/^[HG]/, '').replace(/[a-z]$/, ''), 10);
}

/**
 * Given one verse's original-language words (in order) and that same
 * verse's published lexeme sequence, finds which word corresponds to
 * `ordinal` — by walking both in lockstep from the start of the verse,
 * matching Strong's numbers. Same technique the old always-on hover-match
 * used to use for every verse; here it's scoped to a single verse and only
 * invoked on click of an already-highlighted token, so a mismatch just
 * means "no original word to show for this click" rather than risking any
 * wider breakage.
 */
export function matchOriginalWordAtOrdinal<T extends OriginalWordLike>(
    verseWords: T[],
    verseLexemes: string[],
    ordinal: number
): T | null {
    if (ordinal < 0 || ordinal >= verseLexemes.length) return null;
    let pointer = 0;
    let found: T | null = null;
    for (let i = 0; i <= ordinal; i++) {
        const targetLexeme = normalizeLexemeNumber(verseLexemes[i]);
        found = null;
        while (pointer < verseWords.length) {
            const word = verseWords[pointer];
            pointer++;
            if (word.strongsCode && normalizeLexemeNumber(word.strongsCode) === targetLexeme) {
                found = word;
                break;
            }
        }
        if (!found) return null;
    }
    return found;
}

/**
 * The reverse of `matchOriginalWordAtOrdinal`, and for a different purpose:
 * given one verse's original-language words and its published lexeme
 * sequence, builds the full word-id -> ordinal mapping in a single lockstep
 * pass. Used to answer "does hovering THIS original word have a published
 * ordinal at all, and if so which one" — needed because the original-
 * language panel is the one true "ground truth" side: unlike two
 * translations (each independently, possibly-wrongly aligned), a link from
 * the original text to a translation's compact string isn't a confirmation
 * between two fallible sources, it's a direct lookup. Stops (rather than
 * discarding everything found so far) at the first Strong's-number mismatch
 * — content words before the mismatch keep their real ordinal; words at or
 * after it simply don't appear in the returned map, so they just don't
 * highlight, no wider failure.
 */
export function buildWordOrdinalMap<T extends OriginalWordLike>(
    verseWords: T[],
    verseLexemes: string[]
): Map<number, number> {
    const map = new Map<number, number>();
    let pointer = 0;
    for (let ordinal = 0; ordinal < verseLexemes.length; ordinal++) {
        const targetLexeme = normalizeLexemeNumber(verseLexemes[ordinal]);
        let found = false;
        while (pointer < verseWords.length) {
            const word = verseWords[pointer];
            pointer++;
            if (word.strongsCode && normalizeLexemeNumber(word.strongsCode) === targetLexeme) {
                map.set(word.id, ordinal);
                found = true;
                break;
            }
        }
        if (!found) break;
    }
    return map;
}
