import { apiFetch } from './client';
import type { BranchedAskResponse } from './types';

export interface BranchedAskParams {
    question: string;
    lang?: string;
    book?: string;
    source?: 'door43' | 'aquifer' | 'all';
    per_branch?: number;
    force?: string[];
    password?: string;
}

export function askBranched(params: BranchedAskParams): Promise<BranchedAskResponse> {
    const { password, ...body } = params;
    return apiFetch<BranchedAskResponse>('/api/ask/branched', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
        authed: true,
        password,
    });
}
