import { apiFetch } from './client';
import type { SearchResponse } from './types';

export interface SearchParams {
    q: string;
    lang?: string;
    kind?: string;
    book?: string;
    source?: 'door43' | 'aquifer' | 'all';
    top_k?: number;
    semantic?: boolean;
    password?: string;
}

export function search(params: SearchParams): Promise<SearchResponse> {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) {
        if (k === 'password') continue;
        if (v !== undefined && v !== null) qs.set(k, String(v));
    }
    return apiFetch<SearchResponse>(`/api/search?${qs}`, {
        authed: params.semantic === true,
        password: params.password
    });
}
