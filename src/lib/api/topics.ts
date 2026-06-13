import { apiFetch } from './client';
import type { TopicsResponse, TopicDetail } from './types';

export function getTopics(
    opts?: { source?: string; starts_with?: string; limit?: number; offset?: number }
): Promise<TopicsResponse> {
    const qs = new URLSearchParams();
    if (opts?.source) qs.set('source', opts.source);
    if (opts?.starts_with) qs.set('starts_with', opts.starts_with);
    if (opts?.limit) qs.set('limit', String(opts.limit));
    if (opts?.offset) qs.set('offset', String(opts.offset));
    const q = qs.toString();
    return apiFetch<TopicsResponse>(`/api/topics${q ? `?${q}` : ''}`);
}

export function getTopic(topicId: string, lang = 'en'): Promise<TopicDetail> {
    return apiFetch<TopicDetail>(`/api/topic/${encodeURIComponent(topicId)}?lang=${lang}`);
}
