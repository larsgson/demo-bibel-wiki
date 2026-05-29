<script lang="ts">
    import { getTreeNode } from '../api';
    import type { TreeName } from '../api/tree';
    import type { TreeNode } from '../api/types';
    import SidebarNode from './SidebarNode.svelte';

    type Props = {
        tree: string;
        nodeId: string;
        label: string;
        childCount: number | undefined;
        initialChildren?: TreeNode[];
        pathSegments: string[];
        iso: string;
        activePath: string[];
        activeTree: string;
        depth: number;
        onnavigate: () => void;
    };
    let {
        tree, nodeId, label, childCount, initialChildren,
        pathSegments, iso, activePath, activeTree, depth, onnavigate
    }: Props = $props();

    let expanded = $state(false);
    let fetchedChildren = $state<TreeNode[] | null>(null);
    let children = $derived(fetchedChildren ?? initialChildren ?? null);
    let loading = $state(false);

    let hasChildren = $derived(childCount != null && childCount > 0);

    const browsePath = $derived(
        `/${iso}/browse/${tree}/${pathSegments.join('/')}`
    );

    const isActive = $derived(
        activeTree === tree &&
        activePath.length === pathSegments.length &&
        pathSegments.every((s, i) => activePath[i] === s)
    );

    const isAncestor = $derived(
        activeTree === tree &&
        activePath.length > pathSegments.length &&
        pathSegments.every((s, i) => activePath[i] === s)
    );

    $effect(() => {
        if (isAncestor && !expanded && hasChildren) {
            expanded = true;
            loadChildren();
        }
    });

    function toggle() {
        if (!hasChildren) return;
        expanded = !expanded;
        if (expanded && !children) {
            loadChildren();
        }
    }

    function loadChildren() {
        if (loading || fetchedChildren !== null || initialChildren) return;
        loading = true;
        getTreeNode(tree as TreeName, pathSegments)
            .then((branch) => {
                fetchedChildren = branch.children ?? [];
                loading = false;
            })
            .catch(() => {
                fetchedChildren = [];
                loading = false;
            });
    }

    function childPath(child: TreeNode): string[] {
        return [...pathSegments, child.id];
    }
</script>

<li class="node">
    <div class="node-row" class:active={isActive} style="padding-left: {0.5 + depth * 0.75}rem">
        {#if hasChildren}
            <button class="expand-btn" type="button" onclick={toggle} aria-label={expanded ? 'Collapse' : 'Expand'}>
                <span class="expand-arrow" class:open={expanded}>›</span>
            </button>
        {:else}
            <span class="expand-spacer"></span>
        {/if}
        <a
            class="node-link"
            href={browsePath}
            onclick={onnavigate}
        >
            {label}
        </a>
        {#if childCount != null}
            <span class="node-count">{childCount}</span>
        {/if}
    </div>

    {#if expanded && hasChildren}
        <ul class="node-children">
            {#if loading}
                <li class="node-loading">Loading…</li>
            {:else if children && children.length > 0}
                {#each children as child (child.id)}
                    <SidebarNode
                        tree={tree}
                        nodeId={child.id}
                        label={child.label}
                        childCount={child.child_count}
                        initialChildren={child.children}
                        pathSegments={childPath(child)}
                        iso={iso}
                        activePath={activePath}
                        activeTree={activeTree}
                        depth={depth + 1}
                        onnavigate={onnavigate}
                    />
                {/each}
            {:else}
                <li class="node-empty">Empty</li>
            {/if}
        </ul>
    {/if}
</li>

<style>
    .node { list-style: none; }

    .node-row {
        display: flex;
        align-items: center;
        gap: 0.15rem;
        padding-top: 0.25rem;
        padding-bottom: 0.25rem;
        padding-right: 0.5rem;
        border-left: 3px solid transparent;
        transition: background 120ms ease;
    }
    .node-row:hover { background: rgba(0, 11, 99, 0.04); }
    .node-row.active {
        font-weight: 600;
        border-left-color: rgb(0, 11, 99);
        background: rgba(0, 11, 99, 0.06);
    }

    .expand-btn {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 1.2rem;
        height: 1.2rem;
        border: none;
        background: none;
        cursor: pointer;
        padding: 0;
        flex-shrink: 0;
        color: rgba(0, 11, 99, 0.4);
        font-size: 0.85rem;
    }
    .expand-btn:hover { color: rgb(0, 11, 99); }
    .expand-arrow {
        display: inline-block;
        transition: transform 150ms ease;
    }
    .expand-arrow.open { transform: rotate(90deg); }

    .expand-spacer {
        width: 1.2rem;
        flex-shrink: 0;
    }

    .node-link {
        flex: 1;
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        font-size: 0.82rem;
        color: rgb(0, 11, 99);
        text-decoration: none;
    }
    .node-link:hover { text-decoration: underline; }

    .node-count {
        font-size: 0.65rem;
        color: rgba(0, 11, 99, 0.4);
        flex-shrink: 0;
    }

    .node-children {
        margin: 0;
        padding: 0;
    }
    .node-loading, .node-empty {
        list-style: none;
        font-size: 0.75rem;
        color: rgba(0, 11, 99, 0.4);
        font-style: italic;
        padding: 0.2rem 0 0.2rem 2.5rem;
    }
</style>
