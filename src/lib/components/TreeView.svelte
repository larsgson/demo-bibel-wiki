<script lang="ts">
    import { getTreeRoot, getTreeNode, isApiConfigured } from '../api';
    import type { TreeName } from '../api/tree';
    import type { TreeBranch, ChunkPreview } from '../api/types';
    import { localizeApiPath } from '../api/links';

    type Props = {
        tree: string;
        path: string[];
        iso: string;
    };
    let { tree, path, iso }: Props = $props();

    let branch = $state<TreeBranch | null>(null);
    let loading = $state(true);
    let error = $state<string | null>(null);

    const KNOWN_TREES: TreeName[] = [
        'bible', 'source', 'kind', 'term', 'topic',
        'entity', 'methodology', 'pericope', 'aquifer'
    ];

    const TREE_LABELS: Record<string, string> = {
        bible: 'Bible',

        source: 'By source',
        kind: 'By kind',
        term: 'Terms',
        topic: 'Topics',
        entity: 'Entities',
        methodology: 'Methodology',
        pericope: 'Pericopes',
        aquifer: 'Aquifer'
    };

    $effect(() => {
        const currentTree = tree;
        const currentPath = path;

        branch = null;
        loading = true;
        error = null;

        if (!isApiConfigured()) {
            error = 'API not configured.';
            loading = false;
            return;
        }
        if (!KNOWN_TREES.includes(currentTree as TreeName)) {
            error = `Unknown tree: ${currentTree}`;
            loading = false;
            return;
        }

        const promise = currentPath.length > 0
            ? getTreeNode(currentTree as TreeName, currentPath)
            : getTreeRoot(currentTree as TreeName);

        promise
            .then((data) => {
                if (tree === currentTree && path === currentPath) {
                    branch = data;
                    loading = false;
                }
            })
            .catch((e: any) => {
                if (tree === currentTree && path === currentPath) {
                    if (e?.status === 404) {
                        error = 'Not found.';
                    } else {
                        error = e?.detail || e?.message || 'Failed to load.';
                    }
                    loading = false;
                }
            });
    });

    function childHref(url: string): string {
        const local = localizeApiPath(url, iso);
        if (local !== url) return local;
        const stripped = url.replace(/^\/api\/tree\//, '');
        const parts = stripped.split('/').filter(Boolean);
        // API returns URLs like /en/bible/ot — first segment is lang, skip it
        if (parts.length >= 2 && !KNOWN_TREES.includes(parts[0] as TreeName)) {
            const [, treeName, ...rest] = parts;
            const cleanPath = rest.map((s) => decodeURIComponent(s)).join('/');
            return `/${iso}/browse/${treeName}${cleanPath ? '/' + cleanPath : ''}`;
        }
        if (parts.length >= 1) {
            const [t, ...rest] = parts;
            const cleanPath = rest.map((s) => decodeURIComponent(s)).join('/');
            return `/${iso}/browse/${t}${cleanPath ? '/' + cleanPath : ''}`;
        }
        return `/${iso}/browse/${url}`;
    }
</script>

<div class="tree-view">
    {#if loading}
        <p class="tree-status">Loading…</p>
    {:else if error}
        <p class="tree-status tree-error">{error}</p>
    {:else if !branch}
        <p class="tree-status">No data.</p>
    {:else}
        <div class="tree-header">
            <span class="tree-label">{TREE_LABELS[tree] ?? tree}</span>
            {#if path.length > 0}
                <nav class="tree-breadcrumbs">
                    <a class="tree-crumb" href={`/${iso}/browse/${tree}`}>{TREE_LABELS[tree] ?? tree}</a>
                    {#each path as seg, i (i)}
                        <span class="tree-crumb-sep" aria-hidden="true">›</span>
                        {#if i < path.length - 1}
                            <a class="tree-crumb" href={`/${iso}/browse/${tree}/${path.slice(0, i + 1).join('/')}`}>{decodeURIComponent(seg)}</a>
                        {:else}
                            <span class="tree-crumb-current">{decodeURIComponent(seg)}</span>
                        {/if}
                    {/each}
                </nav>
            {/if}
        </div>

        {#if branch.node.label || branch.node.passage}
            <h1 class="tree-title">
                {branch.node.label ?? ''}
                {#if branch.node.passage}
                    <span class="tree-title-passage">{branch.node.passage}</span>
                {/if}
            </h1>
        {/if}

        {#if branch.node.section_heading}
            <p class="tree-section-heading">{branch.node.section_heading}</p>
        {/if}

        {#if branch.children && branch.children.length > 0}
            <section class="tree-children">
                {#each branch.children as child (child.id)}
                    <a class="tree-child" href={childHref(child.url)}>
                        <span class="tree-child-label">{child.label}</span>
                        {#if child.child_count != null}
                            <span class="tree-child-count">{child.child_count}</span>
                        {/if}
                    </a>
                {/each}
            </section>
        {/if}

        {#if branch.chunks && branch.chunks.length > 0}
            <section class="tree-chunks">
                <h3 class="tree-section-label">Resources ({branch.chunks.length})</h3>
                {#each branch.chunks as chunk (chunk.chunk_id)}
                    <a class="chunk-row" href={`/${iso}/c/${encodeURIComponent(chunk.chunk_id)}`}>
                        <div class="chunk-row-top">
                            <span class="chunk-row-title">{chunk.title}</span>
                            <span class="chunk-row-kind">{chunk.kind}</span>
                        </div>
                        {#if chunk.passage}
                            <span class="chunk-row-passage">{chunk.passage}</span>
                        {/if}
                        <p class="chunk-row-excerpt">{chunk.excerpt}</p>
                    </a>
                {/each}
            </section>
        {/if}

        {#if (!branch.children || branch.children.length === 0) && (!branch.chunks || branch.chunks.length === 0)}
            <p class="tree-status">No content at this node.</p>
        {/if}
    {/if}
</div>

<style>
    .tree-view { max-width: 700px; margin: 0 auto; }
    .tree-status { color: rgba(0, 11, 99, 0.6); font-size: 0.9rem; padding: 1rem 0; }
    .tree-error { color: rgb(180, 80, 20); }

    .tree-header { margin-bottom: 0.75rem; }
    .tree-label {
        font-size: 0.75rem;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.04em;
        color: rgba(0, 11, 99, 0.5);
    }
    .tree-breadcrumbs {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 0.3rem;
        margin-top: 0.3rem;
        font-size: 0.82rem;
    }
    .tree-crumb {
        color: rgb(0, 11, 99);
        text-decoration: none;
    }
    .tree-crumb:hover { text-decoration: underline; }
    .tree-crumb-sep { color: rgba(0, 11, 99, 0.3); }
    .tree-crumb-current { color: rgba(0, 11, 99, 0.6); }

    .tree-title {
        font-size: 1.3rem;
        font-weight: 700;
        color: rgb(0, 11, 99);
        margin: 0 0 0.5rem;
        line-height: 1.3;
    }
    .tree-title-passage {
        font-size: 0.9rem;
        font-weight: 400;
        color: rgba(0, 11, 99, 0.55);
        margin-left: 0.4rem;
    }
    .tree-section-heading {
        font-size: 0.9rem;
        font-style: italic;
        color: rgba(0, 11, 99, 0.6);
        margin: 0 0 1rem;
    }

    .tree-children {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
        gap: 0.5rem;
        margin-bottom: 1.5rem;
    }
    .tree-child {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 0.4rem;
        padding: 0.6rem 0.75rem;
        border: 1px solid rgba(0, 11, 99, 0.1);
        border-radius: 8px;
        text-decoration: none;
        color: rgb(0, 11, 99);
        font-size: 0.88rem;
        font-weight: 500;
        transition: border-color 160ms ease, background 160ms ease;
    }
    .tree-child:hover {
        border-color: rgba(0, 11, 99, 0.3);
        background: rgba(0, 11, 99, 0.03);
    }
    .tree-child-label { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .tree-child-count {
        font-size: 0.7rem;
        color: rgba(0, 11, 99, 0.45);
        flex-shrink: 0;
    }

    .tree-section-label {
        font-size: 0.8rem;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.04em;
        color: rgba(0, 11, 99, 0.55);
        margin: 0 0 0.5rem;
    }
    .tree-chunks {
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
    }
    .chunk-row {
        display: block;
        border: 1px solid rgba(0, 11, 99, 0.1);
        border-radius: 8px;
        padding: 0.6rem;
        text-decoration: none;
        color: inherit;
        transition: border-color 160ms ease;
    }
    .chunk-row:hover { border-color: rgba(0, 11, 99, 0.3); }
    .chunk-row-top {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 0.4rem;
        margin-bottom: 0.15rem;
    }
    .chunk-row-title { font-weight: 600; font-size: 0.88rem; color: rgb(0, 11, 99); }
    .chunk-row-kind {
        font-size: 0.7rem;
        padding: 1px 5px;
        background: rgba(0, 11, 99, 0.06);
        color: rgba(0, 11, 99, 0.5);
        border-radius: 3px;
        flex-shrink: 0;
    }
    .chunk-row-passage { font-size: 0.75rem; color: rgba(0, 11, 99, 0.5); }
    .chunk-row-excerpt {
        font-size: 0.82rem;
        color: rgb(0, 11, 99);
        line-height: 1.45;
        margin: 0.2rem 0 0;
        display: -webkit-box;
        -webkit-line-clamp: 2;
        line-clamp: 2;
        -webkit-box-orient: vertical;
        overflow: hidden;
    }
</style>
