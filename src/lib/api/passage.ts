import { apiFetch } from './client';
import type { PassageResponse } from './types';

export function getPassage(
    opts: { book: string; chapter: number; verse_start?: number; verse_end?: number; corpus?: 'hebrew' | 'greek' }
): Promise<PassageResponse> {
    const qs = new URLSearchParams();
    qs.set('book', opts.book);
    qs.set('chapter', String(opts.chapter));
    if (opts.verse_start) qs.set('verse_start', String(opts.verse_start));
    if (opts.verse_end) qs.set('verse_end', String(opts.verse_end));
    if (opts.corpus) qs.set('corpus', opts.corpus);
    return apiFetch<PassageResponse>(`/api/passage?${qs}`);
}
