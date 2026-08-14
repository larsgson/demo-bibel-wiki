<script lang="ts">
    /**
     * Two-panel parallel/interlinear view: the left panel defaults to
     * original-language text (Hebrew OT / Greek NT, from
     * shoresh.up.qombi.com — see ./shoresh.ts) but can be switched to any
     * modern-translation language via the small picker button in its
     * corner; the right panel shows the currently-selected reading
     * language's plain verse text. Both sides scroll-synced (./scrollSync.ts,
     * ported from example/interlinear's Flutter-inspired implementation).
     *
     * v1 scope (deliberately minimal — see the parallel-view planning
     * discussion): plain verse-to-verse text on both sides, no rich
     * headings/poetry/footnotes rendering. Clicking an aligned (highlighted)
     * translation token shows the original-language word it's aligned to,
     * in a small popover — see wordAlignment.ts's matchOriginalWordAtOrdinal.
     */
    import { onMount } from 'svelte';
    import { fetchShoreshChapter, groupWordsByVerse, verseOfWordId, type ShoreshWord } from './shoresh';
    import { loadChapter, getChapterSource } from '../../stores/chapter-store';
    import { getTestament } from '../bw/bible-utils';
    import { getBookByCode, getBookById } from '../bw/bible-books';
    import { resolveTextSource } from '../bw/source-catalog';
    import { syncScrollPanelsByVerse, resetScrollPanels } from './scrollSync';
    import { t } from '../bw/ui-locales';
    import { uiLangForRegion } from '../data/region-config';
    import { $activeRegion as activeRegionStore } from '../../stores/region-store';
    import { $parallelLeftLang as parallelLeftLangStore } from '../../stores/parallel-left-lang-store';
    import { nameFor } from '../data/languageNames';
    import {
        translationIdForSource,
        getChapterAlignment,
        alignVerseTokens,
        tokensForVerse,
        tokenize,
        verseOfSourceKey,
        decodeSourceKey,
        getVerseLexemes,
        matchOriginalWordAtOrdinal,
        type VerseAlignment,
        type DisplayToken
    } from './wordAlignment';

    const uiLang = uiLangForRegion(activeRegionStore.get());
    const tr = (k: string) => t(uiLang, 'reader.' + k);

    function isRtlLang(langIso: string): boolean {
        const d = nameFor(langIso)?.d;
        return Array.isArray(d) ? d.includes('rtl') : d === 'rtl';
    }

    type Props = {
        bookCode: string;
        chapter: number;
        iso: string;
        /** DBT-style fileset id — only consulted by chapter-store's DBT
         *  fallback tier. Empty string is safe for PKF/helloAO-full
         *  languages (never reach that tier); Reader.svelte passes the real
         *  per-testament id for flat-mode (DBT-sourced) languages. */
        filesetId?: string;
    };
    let { bookCode, chapter, iso, filesetId = '' }: Props = $props();

    let originalWords = $state<ShoreshWord[] | null>(null);
    let originalError = $state(false);
    let leftVerses = $state<Array<{ num: number; text: string }> | null>(null);
    let targetVerses = $state<Array<{ num: number; text: string }> | null>(null);
    let loading = $state(true);

    // Which aligned source key (see wordAlignment.ts's sourceKey()) the
    // pointer is currently over, when hovering a TRANSLATION token in
    // either panel — the two panels' alignments are independently fetched,
    // so this is only ever set from a token's own wordIds, never from the
    // Hebrew/Greek panel (see hoveredOriginalId below for that — a fully
    // separate, simpler concept now that alignment doesn't depend on
    // shoresh at all).
    let hoveredKey = $state<number | null>(null);

    // The Hebrew/Greek "Original" panel's own hover state — plain self-tint
    // only, deliberately NOT wired into the compact-alignments matching
    // system: shoresh's role here is showing the original text (and, once
    // shoresh grows a per-word lexicon endpoint, providing detail on CLICK
    // of an aligned word — not built yet, see shoresh.ts) rather than
    // acting as a required backbone for translation-to-translation
    // highlighting, which now works entirely off compact-alignments' own
    // shared lexeme-ordinal keys (see wordAlignment.ts's module doc).
    let hoveredOriginalId = $state<number | null>(null);

    // Best-effort per-panel word alignment (null when unavailable — most
    // languages/translations still have no published edition). See
    // wordAlignment.ts's module doc.
    let leftAlignment = $state<Map<number, VerseAlignment> | null>(null);
    let rightAlignment = $state<Map<number, VerseAlignment> | null>(null);
    let bookId = $derived(getBookByCode(bookCode)?.id ?? null);

    let isOriginal = $derived($parallelLeftLangStore === 'original');
    let isRtl = $derived(isOriginal ? getTestament(bookCode) === 'ot' : isRtlLang($parallelLeftLangStore));
    let originalGroups = $derived(originalWords ? groupWordsByVerse(originalWords) : []);

    function tokenizedVerses(
        verses: Array<{ num: number; text: string }> | null,
        alignment: Map<number, VerseAlignment> | null
    ): Array<{ num: number; tokens: DisplayToken[] }> | null {
        if (!verses || !alignment || bookId === null) return null;
        return verses.map((v) => {
            const verseAlignment = alignment.get(v.num);
            const targetTokenCount = tokenize(v.text).length;
            const aligned = verseAlignment
                ? alignVerseTokens(bookId!, chapter, v.num, verseAlignment.compact, targetTokenCount)
                : new Map<number, number[]>();
            return { num: v.num, tokens: tokensForVerse(v.text, aligned) };
        });
    }

    let leftTokenVerses = $derived(isOriginal ? null : tokenizedVerses(leftVerses, leftAlignment));
    let targetTokenVerses = $derived(tokenizedVerses(targetVerses, rightAlignment));

    function verseHasKey(tokenVerses: Array<{ num: number; tokens: DisplayToken[] }> | null, key: number): boolean {
        const verse = tokenVerses?.find((v) => v.num === verseOfSourceKey(key));
        return !!verse?.tokens.some((t) => t.wordIds?.includes(key));
    }

    // Whether BOTH translation panels independently align to the hovered
    // source key — vs. only the panel under the pointer (its own alignment
    // trivially "matches itself", which isn't real corroboration by
    // itself). Each panel's alignment is independently fetched and possibly
    // fallible (missing coverage, wrong edition guess), so only show full
    // confidence (yellow) when they agree; a single-sided match shows the
    // lower-confidence blue instead of implying an agreement that was never
    // checked. Meaningless (and unused) while the left panel shows the
    // original text, since that panel's hover doesn't set hoveredKey at all.
    let bothSidesConfirm = $derived(
        hoveredKey !== null && verseHasKey(leftTokenVerses, hoveredKey) && verseHasKey(targetTokenVerses, hoveredKey)
    );

    // Popover shown when clicking an aligned token — just the matched
    // original-language word itself (text only, no shoresh lexicon/grammar
    // lookup yet; see wordAlignment.ts's module doc for why that's a
    // separate, not-yet-built step). Resolved on demand per click, scoped
    // to that one verse — independent of whether the left panel is even
    // showing original text at all.
    type ClickedOriginal = { text: string; isRtl: boolean; ref: string };
    let clickedOriginal = $state<ClickedOriginal | 'not-found' | null>(null);
    let clickAnchor = $state<{ x: number; y: number } | null>(null);

    async function handleTokenClick(key: number, event: MouseEvent) {
        clickAnchor = { x: event.clientX, y: event.clientY };
        clickedOriginal = null;

        const ref = decodeSourceKey(key);
        const book = getBookById(ref.bookId);
        if (!book) {
            clickedOriginal = 'not-found';
            return;
        }
        const [lexemes, words] = await Promise.all([
            getVerseLexemes(book.code, ref.chapter, ref.verse),
            fetchShoreshChapter(book.code, ref.chapter)
        ]);
        if (!lexemes || !words) {
            clickedOriginal = 'not-found';
            return;
        }
        const verseWords = words.filter((w) => verseOfWordId(w.id) === ref.verse);
        const match = matchOriginalWordAtOrdinal(verseWords, lexemes, ref.ordinal);
        clickedOriginal = match
            ? { text: match.text, isRtl: getTestament(book.code) === 'ot', ref: `${book.name} ${ref.chapter}:${ref.verse}` }
            : 'not-found';
    }

    function closeClickedOriginal() {
        clickedOriginal = null;
        clickAnchor = null;
    }

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

    onMount(() => {
        function handleWindowKeydown(e: KeyboardEvent) {
            if (e.key === 'Escape') closeClickedOriginal();
        }
        window.addEventListener('keydown', handleWindowKeydown);
        return () => window.removeEventListener('keydown', handleWindowKeydown);
    });

    // Chrome (e.g. the bottom bar) can change height when the chapter's
    // audio-inline bar or similar appears — cheap enough to just remeasure
    // whenever the displayed reference changes too.
    $effect(() => {
        void bookCode;
        void chapter;
        recomputeHeight();
    });

    /**
     * The right/target panel gets a real filesetId from Reader.svelte
     * (resolved once for the app's primary language, before this component
     * even mounts — see Reader.svelte's currentFlatFilesetId). The left
     * panel's language is picked entirely within this component, so nothing
     * upstream has ever resolved ITS filesetId — needed for chapter-store's
     * DBT/helloAO fallback tiers (its PKF tier ignores filesetId entirely,
     * so this only matters for languages without PKF data, e.g. French).
     * Ported from the same testament-first-then-other-testament fallback
     * ReaderLoader.tsx uses when resolving the app's own primary language.
     */
    async function resolveLeftFilesetId(langCode: string, book: string): Promise<string> {
        if (langCode === 'eng' || langCode === 'original') return '';
        const testament = getTestament(book);
        const other = testament === 'ot' ? 'nt' : 'ot';
        const source = (await resolveTextSource(langCode, testament)) ?? (await resolveTextSource(langCode, other));
        if (source?.provider === 'helloao' && source.id) return `helloao:${source.id}`;
        if (source?.provider === 'dbt' && source.id) return source.id;
        return '';
    }

    async function load(book: string, ch: number, langCode: string, leftLang: string) {
        loading = true;
        originalWords = null;
        originalError = false;
        leftVerses = null;
        targetVerses = null;
        leftAlignment = null;
        rightAlignment = null;
        closeClickedOriginal();

        // Shoresh is only fetched when the left panel actually wants to
        // DISPLAY original text — it's no longer needed for cross-panel
        // alignment matching at all (see wordAlignment.ts's module doc),
        // so languages/situations that don't ask for it never pay for it.
        const wordsLoad = leftLang === 'original' ? fetchShoreshChapter(book, ch) : null;
        const leftLoad =
            leftLang === 'original'
                ? null
                : resolveLeftFilesetId(leftLang, book).then((fsId) => loadChapter(book, ch, fsId, leftLang));
        const rightLoad = loadChapter(book, ch, filesetId, langCode);

        const [words, left, verses] = await Promise.all([
            wordsLoad ?? Promise.resolve(null),
            leftLoad ?? Promise.resolve(null),
            rightLoad
        ]);

        if (leftLang === 'original') {
            originalWords = words;
            originalError = words === null;
        } else {
            leftVerses = left as Array<{ num: number; text: string }> | null;
            originalError = !leftVerses || leftVerses.length === 0;
        }
        targetVerses = verses;
        loading = false;

        // Best-effort alignment fetch, after the panels already have their
        // text — this only ever ADDS hover-highlight on top of what's
        // already showing, never blocks the initial render. Not attempted
        // at all for the original-text panel — nothing to align against
        // there, see hoveredOriginalId above. Reads getChapterSource() only
        // now, AFTER loadChapter has resolved for both panels above — that's
        // what actually reports which edition each panel's text came from
        // (chapter-store.ts's own tier resolution, not a guess derived
        // separately — see wordAlignment.ts's module doc).
        const currentBookId = getBookByCode(book)?.id ?? null;
        if (currentBookId !== null) {
            const leftTid =
                leftLang === 'original' ? null : translationIdForSource(getChapterSource(book, ch, leftLang));
            const rightTid = translationIdForSource(getChapterSource(book, ch, langCode));
            const [leftAl, rightAl] = await Promise.all([
                leftLang === 'original'
                    ? Promise.resolve(null)
                    : getChapterAlignment(leftLang, leftTid, currentBookId, ch),
                getChapterAlignment(langCode, rightTid, currentBookId, ch)
            ]);
            // Guard against a stale response landing after the user already
            // navigated to a different chapter/language.
            if (book === bookCode && ch === chapter && langCode === iso && leftLang === $parallelLeftLangStore) {
                leftAlignment = leftAl;
                rightAlignment = rightAl;
            }
        }
    }

    $effect(() => {
        load(bookCode, chapter, iso, $parallelLeftLangStore);
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
        class:parallel-panel-hebrew={isOriginal && isRtl}
        class:parallel-panel-greek={isOriginal && !isRtl}
        bind:this={originalEl}
        dir={isRtl ? 'rtl' : 'ltr'}
    >
        {#if loading}
            <div class="text-sm text-base-content/60">{tr('loadingChapter')}</div>
        {:else if originalError}
            <div class="alert alert-error text-sm">{tr('noContent')}</div>
        {:else if isOriginal}
            {#each originalGroups as group (group.verse)}
                <p class="parallel-verse" data-verse={group.verse}>
                    <span class="v">{group.verse}</span>
                    {#each group.words as word (word.id)}<span
                            class="parallel-word"
                            class:parallel-word-hover={hoveredOriginalId === word.id}
                            data-word-id={word.id}
                            data-strongs={word.strongsCode ?? ''}
                            onmouseenter={() => (hoveredOriginalId = word.id)}
                            onmouseleave={() => (hoveredOriginalId = null)}>{word.text}</span
                        >{' '}{/each}
                </p>
            {/each}
        {:else if leftTokenVerses}
            {#each leftTokenVerses as v (v.num)}
                <p class="parallel-verse" data-verse={v.num}>
                    <span class="v">{v.num}</span>
                    {#each v.tokens as tok, i (i)}{#if tok.wordIds}<span
                                class="parallel-token"
                                class:parallel-word-hover={hoveredKey !== null &&
                                    tok.wordIds.includes(hoveredKey) &&
                                    bothSidesConfirm}
                                class:parallel-word-hover-blue={hoveredKey !== null &&
                                    tok.wordIds.includes(hoveredKey) &&
                                    !bothSidesConfirm}
                                onmouseenter={() => (hoveredKey = tok.wordIds![0])}
                                onmouseleave={() => (hoveredKey = null)}
                                onclick={(e) => handleTokenClick(tok.wordIds![0], e)}>{tok.text}</span
                            >{:else}{tok.text}{/if}{/each}
                </p>
            {/each}
        {:else}
            {#each leftVerses ?? [] as v (v.num)}
                <p class="parallel-verse" data-verse={v.num}><span class="v">{v.num}</span> {v.text}</p>
            {/each}
        {/if}
    </section>
    <section class="parallel-panel parallel-panel-target" bind:this={targetEl}>
        {#if loading}
            <div class="text-sm text-base-content/60">{tr('loadingChapter')}</div>
        {:else if !targetVerses || targetVerses.length === 0}
            <div class="alert alert-error text-sm">{tr('noContent')}</div>
        {:else if targetTokenVerses}
            {#each targetTokenVerses as v (v.num)}
                <p class="parallel-verse" data-verse={v.num}>
                    <span class="v">{v.num}</span>
                    {#each v.tokens as tok, i (i)}{#if tok.wordIds}<span
                                class="parallel-token"
                                class:parallel-word-hover={hoveredKey !== null &&
                                    tok.wordIds.includes(hoveredKey) &&
                                    bothSidesConfirm}
                                class:parallel-word-hover-blue={hoveredKey !== null &&
                                    tok.wordIds.includes(hoveredKey) &&
                                    !bothSidesConfirm}
                                onmouseenter={() => (hoveredKey = tok.wordIds![0])}
                                onmouseleave={() => (hoveredKey = null)}
                                onclick={(e) => handleTokenClick(tok.wordIds![0], e)}>{tok.text}</span
                            >{:else}{tok.text}{/if}{/each}
                </p>
            {/each}
        {:else}
            {#each targetVerses as v (v.num)}
                <p class="parallel-verse" data-verse={v.num}><span class="v">{v.num}</span> {v.text}</p>
            {/each}
        {/if}
    </section>
</div>

{#if clickedOriginal && clickAnchor}
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div class="parallel-original-backdrop" onclick={closeClickedOriginal}></div>
    <div
        class="parallel-original-popover"
        style="left: {clickAnchor.x}px; top: {clickAnchor.y}px;"
        role="tooltip"
    >
        {#if clickedOriginal === 'not-found'}
            <span class="parallel-original-popover-empty">{tr('parallelOriginalNotFound')}</span>
        {:else}
            <span class="parallel-original-popover-ref">{clickedOriginal.ref}</span>
            <span class="parallel-original-popover-word" dir={clickedOriginal.isRtl ? 'rtl' : 'ltr'}
                >{clickedOriginal.text}</span
            >
        {/if}
        <button type="button" class="parallel-original-popover-close" onclick={closeClickedOriginal} aria-label={tr('close')}
            >&times;</button
        >
    </div>
{/if}

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
    .parallel-word,
    .parallel-token {
        padding: 0 0.1em;
        border-radius: 4px;
        transition: background-color 0.1s;
    }
    /* Hover-highlight for aligned words — amber when BOTH panels' alignment
     * agrees on the same original word (high confidence); light blue when
     * only the hovered side has alignment data for it at all (the other
     * panel's translation isn't covered, or doesn't align this specific
     * word) — a real but unconfirmed match, not full agreement. */
    .parallel-word-hover {
        background-color: rgba(252, 211, 77, 0.6);
    }
    .parallel-word-hover-blue {
        background-color: rgba(147, 197, 253, 0.55);
    }
    :global(#container[data-color-theme='Dark']) .parallel-word-hover {
        background-color: rgba(217, 119, 6, 0.35);
    }
    :global(#container[data-color-theme='Dark']) .parallel-word-hover-blue {
        background-color: rgba(59, 130, 246, 0.3);
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
    .parallel-token {
        cursor: pointer;
    }
    .parallel-original-backdrop {
        position: fixed;
        inset: 0;
        z-index: 30;
    }
    .parallel-original-popover {
        position: fixed;
        z-index: 31;
        transform: translate(-50%, -110%);
        max-width: min(80vw, 20em);
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 0.15em;
        padding: 0.5em 1.6em 0.5em 0.7em;
        border-radius: 0.6em;
        background: canvas;
        color: canvastext;
        box-shadow: 0 6px 20px rgba(0, 0, 0, 0.3);
        border: 1px solid rgba(0, 11, 99, 0.15);
    }
    .parallel-original-popover-ref {
        font-size: 0.7em;
        opacity: 0.6;
    }
    .parallel-original-popover-word {
        font-size: 1.3em;
        font-family: 'SBL BibLit', 'SBL Greek', 'Ezra SIL', 'Gentium Plus', system-ui, sans-serif;
    }
    .parallel-original-popover-empty {
        font-size: 0.85em;
        opacity: 0.7;
    }
    .parallel-original-popover-close {
        position: absolute;
        top: 0.2em;
        inset-inline-end: 0.35em;
        font-size: 1em;
        line-height: 1;
        opacity: 0.6;
        background: transparent;
        border: 0;
        cursor: pointer;
    }
    .parallel-original-popover-close:hover {
        opacity: 1;
    }
</style>
