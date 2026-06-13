import { apiFetch } from './client';
import type { EntitiesResponse, EntityDetail } from './types';

export function getEntities(
    opts?: { type?: string; starts_with?: string; limit?: number; offset?: number }
): Promise<EntitiesResponse> {
    const qs = new URLSearchParams();
    if (opts?.type) qs.set('type', opts.type);
    if (opts?.starts_with) qs.set('starts_with', opts.starts_with);
    if (opts?.limit) qs.set('limit', String(opts.limit));
    if (opts?.offset) qs.set('offset', String(opts.offset));
    const q = qs.toString();
    return apiFetch<EntitiesResponse>(`/api/entities${q ? `?${q}` : ''}`);
}

export function getEntity(entityId: string, lang = 'en'): Promise<EntityDetail> {
    return apiFetch<EntityDetail>(`/api/entity/${encodeURIComponent(entityId)}?lang=${lang}`);
}
