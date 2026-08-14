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
 * Edition-id caveat specific to THIS app (the example app didn't have to
 * deal with this): compact-alignments keys its data by a specific published
 * *edition* id (e.g. "BSB", "ind_ayt"). A target-token INDEX only means
 * anything if it was computed against the exact text being displayed;
 * alignment data for a different edition of the "same" language produces
 * confident-looking but WRONG matches (different word order, different word
 * count per verse), not just missing ones — worse than no highlight at all.
 * So this only ever attempts alignment when the edition is actually known
 * to match, via three paths, in priority order:
 *   1. `manualEditionForLang()` — ../data/alignment-editions.json, a small
 *      hand-curated `{iso: editionId}` map for cases nothing below can
 *      figure out automatically (chiefly PKF, whose bundles carry no
 *      edition id at all) but a human happens to know for certain — e.g.
 *      knowing this app's Indonesian PKF content is the "INDTSI" printing.
 *      Take the same care adding an entry here as picking a wrong one
 *      produces confidently WRONG word matches, not just missing ones.
 *   2. `translationIdForSource()` — chapter-store.ts's own
 *      `getChapterSource()` reports which tier resolved the CURRENTLY
 *      DISPLAYED text; helloAO and DBT both carry a real, externally-
 *      published edition id (a helloAO translation id / DBT distinct-id)
 *      that lines up 1:1 with compact-alignments' own edition-folder
 *      naming, so those are trusted outright. PKF and contrib (this app's
 *      own local files) report null — genuinely unknown, not a guess.
 *   3. `discoverEditionForLang()` — for whatever's left unknown, ONLY when
 *      that language has EXACTLY ONE published compact-alignments edition
 *      at all. With a single candidate there's no "which of several editions
 *      matches" guess to get wrong; with two or more, this deliberately
 *      returns nothing rather than pick one and risk exactly the
 *      wrong-word-highlighted bug this replaced.
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
import manualEditions from '../../data/alignment-editions.json';

const HF_BASE_URL = 'https://huggingface.co/datasets/bcv-commons/compact-alignments/resolve/main';
const HF_TREE_BASE_URL = 'https://huggingface.co/api/datasets/bcv-commons/compact-alignments/tree/main';

/** A stable key for one "content lexeme" slot in a specific verse — a
 *  position in the published lexemes.json sequence, not a shoresh word id.
 *  Packed the same way shoresh's word ids are (BBCCCVVVWW) purely so the
 *  two remain visually similar in devtools; the values are NOT
 *  interchangeable with shoresh ids. */
export function sourceKey(bookId: number, chapter: number, verse: number, ordinal: number): number {
    return bookId * 1_00_000_000 + chapter * 1_00_000 + verse * 100 + ordinal;
}

export function verseOfSourceKey(key: number): number {
    return Math.floor(key / 100) % 1000;
}

export interface SourceKeyRef {
    bookId: number;
    chapter: number;
    verse: number;
    ordinal: number;
}

export function decodeSourceKey(key: number): SourceKeyRef {
    return {
        bookId: Math.floor(key / 1_00_000_000),
        chapter: Math.floor(key / 1_00_000) % 1000,
        verse: Math.floor(key / 100) % 1000,
        ordinal: key % 100
    };
}

/**
 * A hand-curated override for a language whose edition can't be determined
 * any other way (typically PKF, which carries no edition id at all) — see
 * ../data/alignment-editions.json and the module doc comment. Checked
 * FIRST, ahead of both the automatic source-based lookup and discovery, so
 * an entry here always wins even if e.g. discoverEditionForLang would
 * otherwise refuse due to multiple published editions.
 */
export function manualEditionForLang(iso: string): string | null {
    return (manualEditions as Record<string, string>)[iso] ?? null;
}

/**
 * The KNOWN published edition id for whatever chapter-store.ts actually
 * resolved — see the module doc comment. `source` should come straight from
 * chapter-store.ts's `getChapterSource()`, called for the SAME (book,
 * chapter, langCode) that was just loaded, so this reflects the exact text
 * on screen, not a guess about it.
 *
 * Only "helloao" and "dbt" carry a real, externally-published edition
 * identifier (a helloAO translation id / DBT distinct-id) — both are
 * trustworthy 1:1 with compact-alignments' own edition-folder naming
 * convention (iso + that same id). "pkf" (Proskomma bundles have no
 * corresponding id in any external alignment dataset) and "contrib" (this
 * app's own local files) return null — not a guess, a genuine "unknown",
 * same as no source info at all. `getChapterAlignment` falls back to
 * `discoverEditionForLang` in that case, which only succeeds when the
 * language has exactly one published edition — see that function's comment.
 */
export function translationIdForSource(source: { provider: string; id?: string } | null): string | null {
    if (!source?.id) return null;
    if (source.provider === 'helloao' || source.provider === 'dbt') return source.id;
    return null;
}

/**
 * The published edition folder name for a given (iso, translationId) pair —
 * "iso-prefixed unless it already carries one". E.g. iso=eng,
 * translationId=BSB -> "eng_BSB"; iso=ind, translationId=ind_ayt -> "ind_ayt".
 */
export function deriveEditionFolder(iso: string, translationId: string): string {
    return translationId.startsWith(`${iso}_`) ? translationId : `${iso}_${translationId}`;
}

// bookCode -> exact published filename (content-hash suffix included),
// cached per (iso, edition) for the life of this page — content-addressed/
// append-only, so a filename never goes stale once observed.
const editionFileIndexCache = new Map<string, Map<string, string> | null>();

async function getEditionFileIndex(iso: string, edition: string): Promise<Map<string, string> | null> {
    const cacheKey = `${iso}/${edition}`;
    const cached = editionFileIndexCache.get(cacheKey);
    if (cached !== undefined) return cached;

    try {
        const path = `${iso[0]}/${iso}/${edition}`;
        const response = await fetch(`${HF_TREE_BASE_URL}/${path}`);
        if (!response.ok) {
            editionFileIndexCache.set(cacheKey, null);
            return null;
        }
        const entries: { type: string; path: string }[] = await response.json();
        const index = new Map<string, string>();
        for (const entry of entries) {
            if (entry.type !== 'file') continue;
            const filename = entry.path.split('/').pop()!;
            const bookCode = filename.split('_')[0];
            index.set(bookCode, filename);
        }
        editionFileIndexCache.set(cacheKey, index);
        return index;
    } catch {
        editionFileIndexCache.set(cacheKey, null);
        return null;
    }
}

// iso -> the language's one-and-only published edition folder (e.g.
// "fra_fob"), or null when there's no published edition OR more than one —
// see the module doc comment for why "more than one" is deliberately
// treated the same as "none": with a single candidate there's nothing to
// guess between (it MUST be that edition, or nothing), but with several,
// picking one is exactly the kind of unverifiable guess that produces a
// confidently wrong word match instead of no match.
const editionDiscoveryCache = new Map<string, string | null>();

async function discoverEditionForLang(iso: string): Promise<string | null> {
    const cached = editionDiscoveryCache.get(iso);
    if (cached !== undefined) return cached;

    try {
        const path = `${iso[0]}/${iso}`;
        const response = await fetch(`${HF_TREE_BASE_URL}/${path}`);
        if (!response.ok) {
            editionDiscoveryCache.set(iso, null);
            return null;
        }
        const entries: { type: string; path: string }[] = await response.json();
        const editionFolders = entries.filter((e) => e.type !== 'file').map((e) => e.path.split('/').pop()!);
        const editionFolder = editionFolders.length === 1 ? editionFolders[0] : null;
        editionDiscoveryCache.set(iso, editionFolder);
        return editionFolder;
    } catch {
        editionDiscoveryCache.set(iso, null);
        return null;
    }
}

// verse ref ("BOOK C:V") -> ordered lexeme-number array, published once per
// book and shared by every language/edition that aligns to it — cached by
// book only, never by language.
const bookLexemesCache = new Map<string, Record<string, string[]> | null>();

async function getBookLexemes(bookCode: string): Promise<Record<string, string[]> | null> {
    const cached = bookLexemesCache.get(bookCode);
    if (cached !== undefined) return cached;

    try {
        const response = await fetch(`${HF_BASE_URL}/_index/${bookCode}_lexemes.json`);
        if (!response.ok) {
            bookLexemesCache.set(bookCode, null);
            return null;
        }
        const data = await response.json();
        bookLexemesCache.set(bookCode, data);
        return data;
    } catch {
        bookLexemesCache.set(bookCode, null);
        return null;
    }
}

/** One verse's ordered lexeme-code sequence (e.g. ["H1254a", "H853", ...]) —
 *  reuses `getBookLexemes`' whole-book cache, so this is free after the
 *  first call for any verse in that book. */
export async function getVerseLexemes(bookCode: string, chapter: number, verse: number): Promise<string[] | null> {
    const lexemesByRef = await getBookLexemes(bookCode);
    return lexemesByRef?.[`${bookCode} ${chapter}:${verse}`] ?? null;
}

// (iso, edition, bookCode) -> the edition's own compact-array file.
const compactArrayCache = new Map<string, string[] | null>();

async function getCompactArray(iso: string, edition: string, bookCode: string): Promise<string[] | null> {
    const cacheKey = `${iso}/${edition}/${bookCode}`;
    const cached = compactArrayCache.get(cacheKey);
    if (cached !== undefined) return cached;

    const fileIndex = await getEditionFileIndex(iso, edition);
    const filename = fileIndex?.get(bookCode);
    if (!filename) {
        compactArrayCache.set(cacheKey, null);
        return null;
    }

    try {
        const path = `${iso[0]}/${iso}/${edition}/${filename}`;
        const response = await fetch(`${HF_BASE_URL}/${path}`);
        if (!response.ok) {
            compactArrayCache.set(cacheKey, null);
            return null;
        }
        const data = await response.json();
        compactArrayCache.set(cacheKey, data);
        return data;
    } catch {
        compactArrayCache.set(cacheKey, null);
        return null;
    }
}

export interface VerseAlignment {
    /** Raw "srcOrdinal:targetSpan ..." string for this verse (may be ""). */
    compact: string;
}

/**
 * Fetches one chapter's compact alignment strings for (iso, translationId),
 * keyed by verse number. `translationId` should come from
 * `translationIdForSource` — pass `null` when it returned null (no KNOWN
 * edition for this language). Tries, in order: `manualEditionForLang(iso)`
 * (a human-confirmed override, see ../data/alignment-editions.json),
 * `translationId` if given, then `discoverEditionForLang` — which only
 * succeeds when the language has exactly one published edition (see the
 * module doc comment for why an ambiguous case gets no alignment rather
 * than a guess).
 *
 * `_index/{book}_lexemes.json` is fetched only to learn the ORDER of verse
 * refs (the position that lines each verse up with its entry in the
 * edition's own compact-array file) — its lexeme content itself is no
 * longer consumed, see the module doc comment. Returns `null` if no path
 * resolves an edition, or it doesn't cover this book — callers should
 * render plain, unaligned text in that case, not treat it as an error.
 */
export async function getChapterAlignment(
    iso: string,
    translationId: string | null,
    bookId: number,
    chapter: number
): Promise<Map<number, VerseAlignment> | null> {
    const book: Book | undefined = getBookById(bookId);
    if (!book) return null;
    const bookCode = book.code;

    let edition: string | null = null;

    const manual = manualEditionForLang(iso);
    if (manual) {
        const manualExists = await getEditionFileIndex(iso, manual);
        if (manualExists) edition = manual;
    }
    if (!edition && translationId) {
        const known = deriveEditionFolder(iso, translationId);
        const knownExists = await getEditionFileIndex(iso, known);
        if (knownExists) edition = known;
    }
    if (!edition) {
        edition = await discoverEditionForLang(iso);
    }
    if (!edition) return null;

    const [verseRefIndex, compactArray] = await Promise.all([
        getBookLexemes(bookCode),
        getCompactArray(iso, edition, bookCode)
    ]);
    if (!verseRefIndex || !compactArray) return null;

    const refs = Object.keys(verseRefIndex);
    const result = new Map<number, VerseAlignment>();
    for (let i = 0; i < refs.length; i++) {
        const ref = refs[i];
        const match = /^\S+ (\d+):(\d+)$/.exec(ref);
        if (!match) continue;
        const refChapter = Number(match[1]);
        if (refChapter !== chapter) continue;
        const verse = Number(match[2]);
        result.set(verse, { compact: compactArray[i] ?? '' });
    }
    return result;
}

/**
 * Splits a target-language verse's own text into the tokens
 * `compact-alignments`' target-span indices address — NOT whitespace or
 * punctuation splitting. A token is a maximal run of Unicode letters +
 * combining marks (`\p{L}\p{M}`); punctuation, whitespace, and digits are
 * all separators and produce no token at all.
 */
export function tokenize(text: string): string[] {
    return text.normalize('NFC').match(/[\p{L}\p{M}]+/gu) ?? [];
}

/**
 * Splits text into the full ordered sequence of runs (both letter/mark runs
 * AND everything between them), so re-joining every segment's text
 * reconstructs the original exactly — only the letter/mark runs are ever
 * alignment targets. Used for display: punctuation/digits/whitespace still
 * need to render, just never carry a word id.
 */
export function segmentForDisplay(text: string): string[] {
    return text.normalize('NFC').match(/[\p{L}\p{M}]+|[^\p{L}\p{M}]+/gu) ?? [];
}

/** Whether a `segmentForDisplay` segment is a possible alignment target
 *  (a letter/mark run), as opposed to punctuation/digit/whitespace between them. */
export function isAlignableSegment(segment: string): boolean {
    return /[\p{L}\p{M}]/u.test(segment);
}

function decodeSpan(span: string): number[] {
    if (span.includes('-')) {
        const [lo, hi] = span.split('-').map(Number);
        return Array.from({ length: hi - lo + 1 }, (_, i) => lo + i);
    }
    if (span.includes(',')) return span.split(',').map(Number);
    return [Number(span)];
}

export function parseCompactString(compact: string): Map<number, string> {
    const pairs = new Map<number, string>();
    if (!compact) return pairs;
    for (const part of compact.split(' ')) {
        const [ordinal, span] = part.split(':');
        pairs.set(Number(ordinal), span);
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
    compact: string,
    targetTokenCount: number
): Map<number, number[]> {
    const pairs = parseCompactString(compact);
    const result = new Map<number, number[]>();
    for (const [ordinal, span] of pairs) {
        const indices = decodeSpan(span);
        if (indices.some((i) => i < 0 || i >= targetTokenCount)) continue;
        const key = sourceKey(bookId, chapter, verse, ordinal);
        for (const i of indices) {
            const existing = result.get(i);
            if (existing) existing.push(key);
            else result.set(i, [key]);
        }
    }
    return result;
}

export interface DisplayToken {
    text: string;
    wordIds: number[] | null;
}

/** Combines segmentForDisplay + alignVerseTokens' result into the ordered
 *  render-ready segment list for one verse: every segment carries its text,
 *  and alignable segments carry whatever word id(s) (if any) align to them. */
export function tokensForVerse(verseText: string, verseAlignment: Map<number, number[]>): DisplayToken[] {
    const segments = segmentForDisplay(verseText);
    let tokenIdx = 0;
    return segments.map((seg) => {
        if (!isAlignableSegment(seg)) return { text: seg, wordIds: null };
        const wordIds = verseAlignment.get(tokenIdx) ?? null;
        tokenIdx++;
        return { text: seg, wordIds };
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
