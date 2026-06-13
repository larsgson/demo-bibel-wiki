import { apiFetch } from './client';
import type { CrossReferencesResponse } from './types';

export function getCrossReferences(
    bbcccvvv: number,
    opts?: { source?: 'tsk' | 'bsb-parallel'; lang?: string; limit?: number }
): Promise<CrossReferencesResponse> {
    const qs = new URLSearchParams();
    if (opts?.source) qs.set('source', opts.source);
    if (opts?.lang) qs.set('lang', opts.lang);
    if (opts?.limit) qs.set('limit', String(opts.limit));
    const q = qs.toString();
    return apiFetch<CrossReferencesResponse>(`/api/cross-references/${bbcccvvv}${q ? `?${q}` : ''}`);
}
