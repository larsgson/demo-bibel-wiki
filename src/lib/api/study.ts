import { apiFetch } from './client';
import type { StudyResponse } from './types';

export interface StudyParams {
    question: string;
    lang?: string;
    top_k?: number;
    scope?: { source?: string; book?: string | null };
    expand?: ('clause' | 'crossref' | 'topic' | 'all')[];
}

export function study(params: StudyParams): Promise<StudyResponse> {
    return apiFetch<StudyResponse>('/api/study', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(params),
    });
}
