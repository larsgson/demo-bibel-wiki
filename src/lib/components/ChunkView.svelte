<script lang="ts">
    import { getChunk, isApiConfigured } from '../api';
    import type { Chunk, ChunkPreview } from '../api/types';
    import { localizeApiPath } from '../api/links';

    type Props = {
        chunkId: string;
        iso: string;
    };
    let { chunkId, iso }: Props = $props();

    let chunk = $state<Chunk | null>(null);
    let loading = $state(true);
    let error = $state<string | null>(null);

    $effect(() => {
        const currentId = chunkId;

        chunk = null;
        loading = true;
        error = null;

        if (!isApiConfigured()) {
            error = 'API not configured.';
            loading = false;
            return;
        }

        getChunk(currentId)
            .then((data) => {
                if (chunkId === currentId) {
                    chunk = data;
                    loading = false;
                }
            })
            .catch((e: any) => {
                if (chunkId === currentId) {
                    error = e?.status === 404 ? 'Chunk not found.' : (e?.detail || e?.message || 'Failed to load.');
                    loading = false;
                }
            });
    });

    function refLabel(key: string): string {
        if (key === 'passage') return 'Same passage';
        if (key === 'support_ref') return 'Methodology references';
        if (key === 'term') return 'Related terms';
        return key;
    }
</script>

<div class="chunk-view">
    {#if loading}
        <p class="chunk-status">Loading…</p>
    {:else if error}
        <p class="chunk-status chunk-error">{error}</p>
    {:else if chunk}
        <div class="chunk-header">
            <span class="chunk-kind">{chunk.kind}</span>
            {#if chunk.passage}
                <span class="chunk-passage">{chunk.passage}</span>
            {/if}
        </div>
        <h1 class="chunk-title">{chunk.title}</h1>
        <div class="chunk-body">{chunk.body}</div>

        {#if chunk.tags && chunk.tags.length > 0}
            <div class="chunk-tags">
                {#each chunk.tags as tag (tag)}
                    <span class="chunk-tag">{tag}</span>
                {/each}
            </div>
        {/if}

        {#if chunk.all_paths && chunk.all_paths.length > 0}
            <div class="chunk-paths">
                <h3 class="chunk-section-title">Tree paths</h3>
                {#each chunk.all_paths as p (p)}
                    <a class="chunk-path-link" href={localizeApiPath(p, iso)}>{p}</a>
                {/each}
            </div>
        {/if}

        {#each Object.entries(chunk.cross_refs) as [key, refs] (key)}
            {#if refs && refs.length > 0}
                <section class="chunk-xrefs">
                    <h3 class="chunk-section-title">{refLabel(key)}</h3>
                    {#each refs as ref (ref.chunk_id)}
                        <a class="xref-card" href={`/${iso}/c/${encodeURIComponent(ref.chunk_id)}`}>
                            <div class="xref-top">
                                <span class="xref-title">{ref.title}</span>
                                <span class="xref-kind">{ref.kind}</span>
                            </div>
                            {#if ref.passage}
                                <span class="xref-passage">{ref.passage}</span>
                            {/if}
                            <p class="xref-excerpt">{ref.excerpt}</p>
                        </a>
                    {/each}
                </section>
            {/if}
        {/each}

        <div class="chunk-id-footer">
            <span class="chunk-id-label">ID:</span>
            <code class="chunk-id-code">{chunk.chunk_id}</code>
        </div>
    {/if}
</div>

<style>
    .chunk-view { max-width: 700px; margin: 0 auto; }
    .chunk-status { color: rgba(0, 11, 99, 0.6); font-size: 0.9rem; padding: 1rem 0; }
    .chunk-error { color: rgb(180, 80, 20); }

    .chunk-header {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        margin-bottom: 0.5rem;
    }
    .chunk-kind {
        padding: 2px 8px;
        background: rgba(0, 11, 99, 0.08);
        color: rgb(0, 11, 99);
        border-radius: 4px;
        font-size: 0.75rem;
        font-weight: 600;
    }
    .chunk-passage {
        font-size: 0.85rem;
        color: rgba(0, 11, 99, 0.6);
    }
    .chunk-title {
        font-size: 1.4rem;
        font-weight: 700;
        color: rgb(0, 11, 99);
        margin: 0 0 1rem;
        line-height: 1.3;
    }
    .chunk-body {
        font-size: 0.92rem;
        line-height: 1.65;
        color: rgb(0, 11, 99);
        white-space: pre-wrap;
        margin-bottom: 1.5rem;
    }

    .chunk-tags {
        display: flex;
        flex-wrap: wrap;
        gap: 0.35rem;
        margin-bottom: 1.5rem;
    }
    .chunk-tag {
        font-size: 0.7rem;
        padding: 2px 6px;
        background: rgba(0, 11, 99, 0.05);
        color: rgba(0, 11, 99, 0.6);
        border-radius: 3px;
    }

    .chunk-paths { margin-bottom: 1.5rem; }
    .chunk-path-link {
        display: block;
        font-size: 0.8rem;
        color: rgb(0, 11, 99);
        text-decoration: none;
        padding: 0.2rem 0;
        font-family: monospace;
    }
    .chunk-path-link:hover { text-decoration: underline; }

    .chunk-section-title {
        font-size: 0.8rem;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.04em;
        color: rgba(0, 11, 99, 0.55);
        margin: 0 0 0.5rem;
    }

    .chunk-xrefs { margin-bottom: 1.5rem; }
    .xref-card {
        display: block;
        border: 1px solid rgba(0, 11, 99, 0.1);
        border-radius: 8px;
        padding: 0.6rem;
        margin-bottom: 0.5rem;
        text-decoration: none;
        color: inherit;
        transition: border-color 160ms ease;
    }
    .xref-card:hover { border-color: rgba(0, 11, 99, 0.3); }
    .xref-top {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 0.5rem;
        margin-bottom: 0.2rem;
    }
    .xref-title { font-weight: 600; font-size: 0.88rem; color: rgb(0, 11, 99); }
    .xref-kind {
        font-size: 0.7rem;
        padding: 1px 5px;
        background: rgba(0, 11, 99, 0.06);
        color: rgba(0, 11, 99, 0.5);
        border-radius: 3px;
        flex-shrink: 0;
    }
    .xref-passage { font-size: 0.75rem; color: rgba(0, 11, 99, 0.5); }
    .xref-excerpt {
        font-size: 0.82rem;
        color: rgb(0, 11, 99);
        line-height: 1.45;
        margin: 0.2rem 0 0;
        display: -webkit-box;
        -webkit-line-clamp: 3;
        line-clamp: 3;
        -webkit-box-orient: vertical;
        overflow: hidden;
    }

    .chunk-id-footer {
        margin-top: 2rem;
        padding-top: 1rem;
        border-top: 1px solid rgba(0, 11, 99, 0.1);
        font-size: 0.75rem;
        color: rgba(0, 11, 99, 0.4);
    }
    .chunk-id-label { margin-right: 0.3rem; }
    .chunk-id-code { font-family: monospace; }
</style>
