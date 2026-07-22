/**
 * Client for the shoresh.up.qombi.com interlinear backend — word-level
 * Hebrew (OT) / Greek (NT) text with Strong's codes, used as the "original
 * language" panel in the parallel view. One endpoint serves both testaments
 * (it resolves Hebrew vs Greek internally from the book code) — see
 * example/interlinear/data-api/API_CONTRACT.md for the full contract this
 * implements (word/lexicon/grammar detail, not used yet — see the `id`
 * field kept on each word for that future step).
 *
 * Word/verse id packing (ported from example/interlinear/web-app/src/lib/reference.ts):
 * BBCCCVVVWW — book(2) chapter(3) verse(3) word-in-verse(2).
 */

const SHORESH_API = 'https://shoresh.up.qombi.com/interlinear';

export interface ShoreshWord {
    id: number;
    text: string;
    strongsCode: string | null;
}

interface ShoreshChapterResponse {
    book: string;
    chapter: number;
    hebrewGreekWords: ShoreshWord[];
}

export function verseOfWordId(wordId: number): number {
    return Math.floor(wordId / 100) % 1000;
}

/** Word ids in chapter order, grouped by verse (also chapter order within each verse). */
export function groupWordsByVerse(words: ShoreshWord[]): Array<{ verse: number; words: ShoreshWord[] }> {
    const groups: Array<{ verse: number; words: ShoreshWord[] }> = [];
    for (const word of words) {
        const verse = verseOfWordId(word.id);
        const last = groups.at(-1);
        if (last && last.verse === verse) last.words.push(word);
        else groups.push({ verse, words: [word] });
    }
    return groups;
}

export async function fetchShoreshChapter(bookCode: string, chapter: number): Promise<ShoreshWord[] | null> {
    try {
        const resp = await fetch(`${SHORESH_API}/chapter/${bookCode}/${chapter}`);
        if (!resp.ok) return null;
        const json: ShoreshChapterResponse = await resp.json();
        return json.hebrewGreekWords ?? null;
    } catch {
        return null;
    }
}
