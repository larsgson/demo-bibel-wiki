import { apiFetch } from './client';
import type { BranchedSearchResponse } from './types';

export interface BranchedSearchParams {
    q: string;
    lang?: string;
    book?: string;
    source?: 'door43' | 'aquifer' | 'all';
    per_branch?: number;
    semantic?: boolean;
    force?: string[];
}

export function searchBranched(params: BranchedSearchParams): Promise<BranchedSearchResponse> {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) {
        if (k === 'force') continue;
        if (v !== undefined && v !== null) qs.set(k, String(v));
    }
    if (params.force?.length) qs.set('force', params.force.join(','));
    return apiFetch<BranchedSearchResponse>(`/api/search/branched?${qs}`);
}
