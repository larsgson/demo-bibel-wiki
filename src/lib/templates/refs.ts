import type { ParsedReference } from './types';

const BOOK_CODE_ALIASES: Record<string, string> = { JOH: 'JHN' };

export function normalizeBookCode(bookCode: string): string {
    if (!bookCode) return bookCode;
    const upper = bookCode.toUpperCase();
    return BOOK_CODE_ALIASES[upper] ?? upper;
}

const NT_BOOKS = new Set([
    'MAT','MRK','LUK','JHN','ACT','ROM','1CO','2CO','GAL','EPH','PHP','COL',
    '1TH','2TH','1TI','2TI','TIT','PHM','HEB','JAS','1PE','2PE','1JN','2JN','3JN','JUD','REV'
]);

export function getTestament(bookCode: string): 'nt' | 'ot' {
    return NT_BOOKS.has(normalizeBookCode(bookCode)) ? 'nt' : 'ot';
}

/**
 * Parse a single reference like "GEN 1:1-2", "JHN 3:16", "MAT 5:3,5,7".
 * Returns null if the format is unrecognised.
 */
export function parseReference(reference: string): ParsedReference | null {
    if (!reference) return null;
    const match = reference.match(/^([A-Z0-9]+)\s+(\d+):(.+)$/i);
    if (!match) return null;

    const book = normalizeBookCode(match[1]);
    const chapter = parseInt(match[2], 10);
    const versePart = match[3];

    if (versePart.includes(',')) {
        const verses = versePart.split(',').map((v) => parseInt(v.trim(), 10));
        return { book, chapter, verses };
    }
    if (versePart.includes('-')) {
        const [start, end] = versePart.split('-').map((v) => parseInt(v.trim(), 10));
        return { book, chapter, verseStart: start, verseEnd: end };
    }
    const verse = parseInt(versePart, 10);
    return { book, chapter, verseStart: verse, verseEnd: verse };
}

/**
 * Split a comma-separated multi-reference string ("GEN 1:1, 2:3, MAT 5:7")
 * into a list of single-reference strings, propagating book + chapter
 * context across continuations.
 */
export function splitReference(reference: string): string[] {
    if (!reference) return [];
    const parts = reference.split(',').map((p) => p.trim());
    const out: string[] = [];
    let currentBook: string | null = null;
    let currentChapter: string | null = null;

    for (const part of parts) {
        const fullMatch = part.match(/^([A-Z0-9]+)\s+(\d+):(.+)$/i);
        const chapterMatch = part.match(/^(\d+):(.+)$/);
        if (fullMatch) {
            currentBook = normalizeBookCode(fullMatch[1]);
            currentChapter = fullMatch[2];
            out.push(part);
        } else if (chapterMatch && currentBook) {
            currentChapter = chapterMatch[1];
            out.push(`${currentBook} ${part}`);
        } else if (currentBook && currentChapter) {
            out.push(`${currentBook} ${currentChapter}:${part}`);
        }
    }
    return out;
}
