<script lang="ts">
    /**
     * Two-panel parallel/interlinear view: original-language text (Hebrew OT /
     * Greek NT, from shoresh.up.qombi.com — see ./shoresh.ts) on one side,
     * the currently-selected reading language's plain verse text on the
     * other, scroll-synced (./scrollSync.ts, ported from
     * example/interlinear's Flutter-inspired implementation).
     *
     * v1 scope (deliberately minimal — see the parallel-view planning
     * discussion): plain verse-to-verse text on BOTH sides, no rich
     * headings/poetry/footnotes rendering, no word click yet. Each Hebrew/
     * Greek word IS already rendered as its own span carrying
     * data-word-id/data-strongs, so wiring a click handler later doesn't
     * require touching the rendering here again.
     */
    import { onMount } from 'svelte';
    import { fetchShoreshChapter, groupWordsByVerse, type ShoreshWord } from './shoresh';
    import { loadChapter } from '../../stores/chapter-store';
    import { getTestament } from '../bw/bible-utils';
    import { syncScrollPanelsByVerse, resetScrollPanels } from './scrollSync';
    import { t } from '../bw/ui-locales';
    import { uiLangForRegion } from '../data/region-config';
    import { $activeRegion as activeRegionStore } from '../../stores/region-store';

    const uiLang = uiLangForRegion(activeRegionStore.get());
    const tr = (k: string) => t(uiLang, 'reader.' + k);

    type Props = {
        bookCode: string;
        chapter: number;
        iso: string;
        /** DBT-style fileset id — only consulted by chapter-store's DBT/helloao
         *  fallback tiers; PKF and the eng/helloAO-full-reader path (this
         *  component's only callers today) never reach those, so an empty
         *  string is safe here for now. Pass the real id once this is wired
         *  into DbtChapterReader too. */
        filesetId?: string;
    };
    let { bookCode, chapter, iso, filesetId = '' }: Props = $props();

    let originalWords = $state<ShoreshWord[] | null>(null);
    let originalError = $state(false);
    let targetVerses = $state<Array<{ num: number; text: string }> | null>(null);
    let loading = $state(true);

    let isRtl = $derived(getTestament(bookCode) === 'ot');
    let originalGroups = $derived(originalWords ? groupWordsByVerse(originalWords) : []);

    let originalEl: HTMLElement | undefined = $state();
    let targetEl: HTMLElement | undefined = $state();
    let rootEl: HTMLElement | undefined = $state();

    // Real available height, measured rather than guessed: from this
    // element's own top down to the bottom of the viewport, minus whatever
    // fixed chrome sits below it (only the Standard-mode bottom bar today —
    // Study mode has no fixed bottom chrome, and the selector-visibility
    // check makes this correct either way without special-casing the level).
    // Side-by-side (row layout, wide screens) each panel then stretches to
    // the FULL height via flexbox's default cross-axis stretch; stacked
    // (column layout, narrow screens) each panel gets exactly half via the
    // panels' own `flex: 1 1 50%` — both already fall out of the CSS below
    // once this element's total height is correct, no separate JS split needed.
    const MIN_HEIGHT_PX = 240;
    let computedHeight = $state('70vh');

    function recomputeHeight() {
        if (!rootEl || typeof window === 'undefined') return;
        const top = rootEl.getBoundingClientRect().top;
        const bottomBar = document.querySelector<HTMLElement>('.standard-bottom-bar');
        const bottomBarVisible = !!bottomBar && getComputedStyle(bottomBar).display !== 'none';
        const bottomBarHeight = bottomBarVisible ? bottomBar!.getBoundingClientRect().height : 0;
        const viewportHeight = window.visualViewport?.height ?? window.innerHeight;
        const available = viewportHeight - top - bottomBarHeight;
        computedHeight = `${Math.max(available, MIN_HEIGHT_PX)}px`;
    }

    onMount(() => {
        recomputeHeight();
        window.addEventListener('resize', recomputeHeight);
        window.addEventListener('orientationchange', recomputeHeight);
        return () => {
            window.removeEventListener('resize', recomputeHeight);
            window.removeEventListener('orientationchange', recomputeHeight);
        };
    });

    // Chrome (e.g. the bottom bar) can change height when the chapter's
    // audio-inline bar or similar appears — cheap enough to just remeasure
    // whenever the displayed reference changes too.
    $effect(() => {
        void bookCode;
        void chapter;
        recomputeHeight();
    });

    async function load(book: string, ch: number, langCode: string) {
        loading = true;
        originalWords = null;
        originalError = false;
        targetVerses = null;
        const [words, verses] = await Promise.all([
            fetchShoreshChapter(book, ch),
            loadChapter(book, ch, filesetId, langCode)
        ]);
        originalWords = words;
        originalError = words === null;
        targetVerses = verses;
        loading = false;
    }

    $effect(() => {
        load(bookCode, chapter, iso);
    });

    $effect(() => {
        if (!originalEl || !targetEl) return;
        return syncScrollPanelsByVerse(originalEl, targetEl);
    });

    $effect(() => {
        // Re-run whenever the displayed chapter changes — both panels'
        // previous scroll position is meaningless for different content.
        void bookCode;
        void chapter;
        if (!originalEl || !targetEl) return;
        resetScrollPanels(originalEl, targetEl);
    });
</script>

<div class="parallel-view" bind:this={rootEl} style="height: {computedHeight}">
    <section
        class="parallel-panel parallel-panel-original"
        class:parallel-panel-hebrew={isRtl}
        class:parallel-panel-greek={!isRtl}
        bind:this={originalEl}
        dir={isRtl ? 'rtl' : 'ltr'}
    >
        {#if loading}
            <div class="text-sm text-base-content/60">{tr('loadingChapter')}</div>
        {:else if originalError}
            <div class="alert alert-error text-sm">{tr('noContent')}</div>
        {:else}
            {#each originalGroups as group (group.verse)}
                <p class="parallel-verse" data-verse={group.verse}>
                    <span class="v">{group.verse}</span>
                    {#each group.words as word (word.id)}<span
                            class="parallel-word"
                            data-word-id={word.id}
                            data-strongs={word.strongsCode ?? ''}>{word.text}</span
                        >{' '}{/each}
                </p>
            {/each}
        {/if}
    </section>
    <section class="parallel-panel parallel-panel-target" bind:this={targetEl}>
        {#if loading}
            <div class="text-sm text-base-content/60">{tr('loadingChapter')}</div>
        {:else if !targetVerses || targetVerses.length === 0}
            <div class="alert alert-error text-sm">{tr('noContent')}</div>
        {:else}
            {#each targetVerses as v (v.num)}
                <p class="parallel-verse" data-verse={v.num}><span class="v">{v.num}</span> {v.text}</p>
            {/each}
        {/if}
    </section>
</div>

<style>
    .parallel-view {
        display: flex;
        flex-direction: column;
        /* Height is set inline (computedHeight) — measured against the real
         * viewport, not assumed from the parent. */
        min-height: 0;
    }
    .parallel-panel {
        flex: 1 1 50%;
        /* Flex items default to min-width/min-height:auto, which refuses to
         * shrink a panel below its content's unwrapped intrinsic width —
         * exactly the "horizontal scrollbar instead of wrapping" bug this
         * fixes. Needed on both axes since flex-direction flips between
         * column (mobile, stacked) and row (wide screens, side-by-side). */
        min-width: 0;
        min-height: 0;
        overflow-y: auto;
        overflow-wrap: break-word;
        padding: 0.75em 0.9em;
        /* Scroll stays fully functional (scrollSync needs a real scrollTop
         * to sync against) — only the visible track is hidden, so there's
         * one scroll affordance (the page's own) instead of a scrollbar per
         * panel plus the page's. */
        scrollbar-width: none;
        -ms-overflow-style: none;
    }
    .parallel-panel::-webkit-scrollbar {
        display: none;
    }
    .parallel-panel-original {
        border-bottom: 1px solid rgba(0, 11, 99, 0.12);
        line-height: 2;
    }
    /* Hebrew's pointing/cantillation marks need real size to stay legible;
     * Greek has no such marks and reads oversized at the same scale. */
    .parallel-panel-hebrew {
        font-family: 'SBL BibLit', 'Ezra SIL', system-ui, sans-serif;
        font-size: 1.2em;
    }
    .parallel-panel-greek {
        font-family: 'SBL Greek', 'Gentium Plus', system-ui, sans-serif;
        font-size: 0.85em;
    }
    .parallel-verse {
        margin: 0 0 0.6em;
    }
    /* Verse number reuses .reader-body .v (reader.css) — the app's proven
     * technique (relative-position, not <sup>) for exactly the layout bug
     * that was here before: Tailwind Preflight's sub/sup line-height:0
     * reset collapsing the number's line box. Both panels sit inside the
     * .reader-body wrapper (see Reader.svelte), so that global rule applies
     * here without redeclaring it. */
    .parallel-word {
        padding: 0 0.1em;
        border-radius: 4px;
    }
    @media (min-width: 640px) {
        .parallel-view {
            flex-direction: row;
        }
        .parallel-panel-original {
            border-bottom: none;
            border-inline-end: 1px solid rgba(0, 11, 99, 0.12);
        }
    }
</style>
