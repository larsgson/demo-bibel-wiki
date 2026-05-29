import { apiFetch } from './client';
import type { Chunk } from './types';

export function getChunk(chunkId: string): Promise<Chunk> {
    return apiFetch<Chunk>(`/api/chunk/${encodeURIComponent(chunkId)}`);
}
