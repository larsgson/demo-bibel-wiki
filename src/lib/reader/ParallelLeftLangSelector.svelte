<script lang="ts">
    /**
     * Language picker for the parallel view's LEFT panel — a Svelte-native
     * near-clone of LanguageSelectorIsland.tsx (the primary-language picker
     * at the top of the page): same data source ($languageNames, the full
     * ALL-langs-compact.json catalog via language-store's loadLanguageNames),
     * same quick-picks/search UX, same visual language (Tailwind utility
     * classes + the app's --bg/--text/--accent/--border CSS variables).
     * Reimplemented in Svelte rather than mounted as a React island because
     * ReaderTopBar/Reader are Svelte and this repo has no Svelte<->React
     * bridge for interactive dialogs (see BiblePickerSheet's window-
     * CustomEvent pattern, which is for a self-mounted *global* overlay, not
     * a per-caller one like this).
     *
     * One rule beyond the primary picker: whatever language is selected as
     * the app's primary reading language cannot be picked here too (a
     * left-vs-left duplicate would be pointless) — enforced by simply
     * excluding it from the language list built below.
     */
    import { onMount } from 'svelte';
    import { t } from '../bw/ui-locales';
    import { uiLangForRegion } from '../data/region-config';
    import { $activeRegion as activeRegionStore } from '../../stores/region-store';
    import {
        $selectedLanguage as selectedLanguageStore,
        $languageNames as languageNamesStore,
        loadLanguageNames
    } from '../../stores/language-store';
    import { $parallelLeftLang as parallelLeftLangStore, setParallelLeftLang } from '../../stores/parallel-left-lang-store';

    type Props = { onClose: () => void };
    let { onClose }: Props = $props();

    const uiLang = uiLangForRegion(activeRegionStore.get());
    const tr = (k: string) => t(uiLang, k);

    const RECENT_KEY = 'bibel-wiki-parallel-left-recent-langs';
    const MAX_RECENTS = 5;
    const QUICK_PICK_CODES = ['eng', 'cmn', 'hin', 'spa', 'arb', 'fra', 'por'];
    const ORIGINAL_CODE = 'original';

    type Lang = { code: string; english: string; vernacular: string };

    function getRecentLangs(): string[] {
        try {
            const raw = localStorage.getItem(RECENT_KEY);
            return raw ? JSON.parse(raw) : [];
        } catch {
            return [];
        }
    }
    function addRecentLang(code: string) {
        try {
            const recents = getRecentLangs().filter((c) => c !== code);
            recents.unshift(code);
            localStorage.setItem(RECENT_KEY, JSON.stringify(recents.slice(0, MAX_RECENTS)));
        } catch {
            /* ignore */
        }
    }

    let searchTerm = $state('');
    let highlightIdx = $state(-1);
    let listEl: HTMLElement | undefined = $state();
    const recentCodes = getRecentLangs();

    onMount(() => {
        loadLanguageNames();
    });

    let languages = $derived.by((): Lang[] => {
        const names = $languageNamesStore;
        const primary = $selectedLanguageStore;
        const out: Lang[] = [{ code: ORIGINAL_CODE, english: tr('reader.parallelOriginal'), vernacular: tr('reader.parallelOriginal') }];
        for (const [code, info] of Object.entries(names)) {
            if (code === primary) continue;
            out.push({ code, english: info.n ?? code, vernacular: info.v ?? info.n ?? code });
        }
        out.sort((a, b) => a.english.localeCompare(b.english));
        return out;
    });

    let quickPicks = $derived.by((): Lang[] => {
        if (!languages.length) return [];
        const byCode = new Map(languages.map((l) => [l.code, l]));
        const picks: Lang[] = [];
        const added = new Set<string>();
        // Original is always available as a quick pick — it's the default.
        if (byCode.has(ORIGINAL_CODE)) {
            picks.push(byCode.get(ORIGINAL_CODE)!);
            added.add(ORIGINAL_CODE);
        }
        for (const code of recentCodes) {
            if (added.has(code)) continue;
            const lang = byCode.get(code);
            if (lang) {
                picks.push(lang);
                added.add(code);
            }
        }
        for (const code of QUICK_PICK_CODES) {
            if (added.has(code)) continue;
            const lang = byCode.get(code);
            if (lang) {
                picks.push(lang);
                added.add(code);
            }
        }
        return picks.slice(0, 8);
    });

    let searchResults = $derived.by((): Lang[] => {
        const search = searchTerm.trim().toLowerCase();
        if (search.length < 2) return [];
        return languages.filter(
            (l) =>
                l.english.toLowerCase().includes(search) ||
                l.vernacular.toLowerCase().includes(search) ||
                l.code.toLowerCase().includes(search)
        );
    });

    $effect(() => {
        highlightIdx = searchResults.length > 0 ? 0 : -1;
    });

    function isSelected(code: string) {
        return code === $parallelLeftLangStore;
    }

    function handleSelect(lang: Lang) {
        addRecentLang(lang.code);
        setParallelLeftLang(lang.code);
        onClose();
    }

    function handleKeyDown(e: KeyboardEvent) {
        const len = searchResults.length;
        if (e.key === 'Escape') {
            e.preventDefault();
            onClose();
            return;
        }
        if (!len) return;
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            highlightIdx = (highlightIdx + 1) % len;
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            highlightIdx = highlightIdx <= 0 ? len - 1 : highlightIdx - 1;
        } else if (e.key === 'Enter' && highlightIdx >= 0 && highlightIdx < len) {
            e.preventDefault();
            handleSelect(searchResults[highlightIdx]);
        }
    }

    $effect(() => {
        if (highlightIdx < 0 || !listEl) return;
        const el = listEl.querySelector(`[data-idx="${highlightIdx}"]`);
        el?.scrollIntoView({ block: 'nearest' });
    });

    let showResults = $derived(searchTerm.trim().length >= 2);
</script>

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onclick={onClose}>
    <div
        class="rounded-lg w-full max-w-md max-h-[80vh] flex flex-col"
        style="background-color: var(--bg); color: var(--text)"
        onclick={(e) => e.stopPropagation()}
        onkeydown={handleKeyDown}
    >
        <div class="flex items-center justify-between p-4 border-b" style="border-color: var(--border, #e5e7eb)">
            <h2 class="text-lg font-semibold" style="color: var(--text)">{tr('reader.parallelLeftLangButton')}</h2>
            <button
                type="button"
                onclick={onClose}
                class="text-xl opacity-60 hover:opacity-100"
                style="color: var(--text)"
                aria-label={tr('reader.close')}
            >
                &times;
            </button>
        </div>

        {#if !showResults && quickPicks.length > 0}
            <div class="p-3 flex flex-wrap gap-2">
                {#each quickPicks as lang (lang.code)}
                    {@const selected = isSelected(lang.code)}
                    <button
                        type="button"
                        onclick={() => handleSelect(lang)}
                        class="px-3 py-1.5 rounded-full text-sm border transition-colors"
                        class:font-semibold={selected}
                        style="border-color: {selected
                            ? 'var(--accent, #60a5fa)'
                            : 'var(--border, #d1d5db)'}; background-color: {selected
                            ? 'var(--accent, #60a5fa)'
                            : 'color-mix(in srgb, var(--text) 15%, var(--bg))'}; color: {selected
                            ? 'var(--bg, #fff)'
                            : 'var(--text)'}; opacity: {selected ? 1 : 0.8}"
                    >
                        {lang.english}{selected ? ' ✓' : ''}
                    </button>
                {/each}
            </div>
        {/if}

        <div class="px-3 pb-3">
            <input
                type="text"
                class="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2"
                style="border-color: var(--border, #d1d5db); background-color: var(--bg); color: var(--text)"
                placeholder={tr('reader.parallelSearchLangs')}
                bind:value={searchTerm}
                autofocus
            />
        </div>

        {#if showResults}
            <div class="flex-1 overflow-y-auto px-3 pb-3" bind:this={listEl}>
                {#each searchResults as lang, idx (lang.code)}
                    {@const selected = isSelected(lang.code)}
                    {@const highlighted = idx === highlightIdx}
                    <button
                        type="button"
                        data-idx={idx}
                        onclick={() => handleSelect(lang)}
                        onmouseenter={() => (highlightIdx = idx)}
                        class="w-full text-left px-3 py-2 rounded-md mb-1 flex items-center gap-2"
                        class:font-semibold={selected}
                        style="color: var(--text); background-color: {highlighted
                            ? 'var(--accent, #3b82f6)'
                            : 'transparent'}; opacity: {highlighted ? 0.9 : 1}"
                    >
                        <div class="flex-1 min-w-0">
                            <div class="truncate">{lang.english}{selected ? ' ✓' : ''}</div>
                            {#if lang.vernacular !== lang.english}
                                <div class="text-sm truncate" style="color: var(--text); opacity: 0.6">{lang.vernacular}</div>
                            {/if}
                        </div>
                        <span class="text-xs flex-shrink-0" style="color: var(--text); opacity: 0.4">{lang.code}</span>
                    </button>
                {/each}
                {#if searchResults.length === 0}
                    <div class="text-center py-4" style="color: var(--text); opacity: 0.5">
                        {tr('reader.parallelNoLangsFound')} "{searchTerm}"
                    </div>
                {/if}
            </div>
        {/if}

        <div class="p-3 border-t" style="border-color: var(--border, #e5e7eb)">
            <button
                type="button"
                onclick={onClose}
                class="w-full py-2 px-4 rounded-md"
                style="background-color: var(--accent, #e5e7eb); color: var(--bg, #1f2937); opacity: 0.9"
            >
                {tr('reader.close')}
            </button>
        </div>
    </div>
</div>
