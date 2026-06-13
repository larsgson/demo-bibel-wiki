import { apiFetch } from './client';
import type { ConcordanceResponse } from './types';

export function getConcordance(
    word: string,
    opts?: { lang?: string; limit?: number; offset?: number }
): Promise<ConcordanceResponse> {
    const qs = new URLSearchParams();
    if (opts?.lang) qs.set('lang', opts.lang);
    if (opts?.limit) qs.set('limit', String(opts.limit));
    if (opts?.offset) qs.set('offset', String(opts.offset));
    const q = qs.toString();
    return apiFetch<ConcordanceResponse>(`/api/concordance/${encodeURIComponent(word)}${q ? `?${q}` : ''}`);
}
