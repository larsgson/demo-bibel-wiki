<script lang="ts">
    import { t } from '../bw/ui-locales';
    import { uiLangForRegion } from '../data/region-config';
    import { $activeRegion as activeRegionStore } from '../../stores/region-store';
    const uiLang = uiLangForRegion(activeRegionStore.get());
    function goto(path: string) { window.location.href = path; }

    type LangEntry = {
        iso: string;
        name: string;
        alt?: string;
        regionId: string;
        regionName: string;
    };

    let { languages }: { languages: LangEntry[] } = $props();

    let query = $state('');
    let open = $state(false);
    let highlightIdx = $state(0);
    let inputEl: HTMLInputElement | undefined = $state();
    let listboxId = 'lang-search-results';

    const MIN_CHARS = 2;
    const MAX_RESULTS = 12;

    const results = $derived.by(() => {
        const q = query.trim().toLowerCase();
        if (q.length < MIN_CHARS) return [] as LangEntry[];
        return languages
            .filter(
                (l) =>
                    l.iso.toLowerCase().includes(q) ||
                    l.name.toLowerCase().includes(q) ||
                    (l.alt?.toLowerCase().includes(q) ?? false)
            )
            .slice(0, MAX_RESULTS);
    });

    $effect(() => {
        // Reset selection when results change.
        void results.length;
        highlightIdx = 0;
    });

    function highlight(text: string | undefined, q: string): string {
        if (!text) return '';
        if (!q) return escapeHtml(text);
        const lower = text.toLowerCase();
        const idx = lower.indexOf(q.toLowerCase());
        if (idx < 0) return escapeHtml(text);
        const before = escapeHtml(text.slice(0, idx));
        const hit = escapeHtml(text.slice(idx, idx + q.length));
        const after = escapeHtml(text.slice(idx + q.length));
        return `${before}<mark>${hit}</mark>${after}`;
    }

    function escapeHtml(s: string): string {
        return s.replace(/[&<>"']/g, (c) => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
        }[c]!));
    }

    function select(lang: LangEntry) {
        goto(`/${lang.iso}`);
    }

    function onKey(e: KeyboardEvent) {
        if (!results.length) {
            if (e.key === 'Escape') { query = ''; inputEl?.blur(); }
            return;
        }
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            highlightIdx = (highlightIdx + 1) % results.length;
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            highlightIdx = highlightIdx <= 0 ? results.length - 1 : highlightIdx - 1;
        } else if (e.key === 'Enter') {
            e.preventDefault();
            select(results[highlightIdx]);
        } else if (e.key === 'Escape') {
            e.preventDefault();
            query = '';
            inputEl?.blur();
        }
    }

    const query_str = $derived(query.trim());
</script>

<div class="lang-search" role="combobox" aria-haspopup="listbox" aria-expanded={results.length > 0} aria-controls={listboxId} aria-owns={listboxId}>
    <div class="lang-search-box">
        <span class="lang-search-icon" aria-hidden="true">
            <svg viewBox="0 0 20 20" fill="none" width="18" height="18">
                <circle cx="9" cy="9" r="6" stroke="currentColor" stroke-width="2" />
                <path d="m14 14 3 3" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
            </svg>
        </span>
        <input
            bind:this={inputEl}
            bind:value={query}
            onkeydown={onKey}
            onfocus={() => (open = true)}
            onblur={() => setTimeout(() => (open = false), 120)}
            type="search"
            aria-autocomplete="list"
            aria-controls={listboxId}
            placeholder="Search by language name or ISO code…"
            autocomplete="off"
            spellcheck="false"
        />
        {#if query}
            <button
                type="button"
                class="lang-search-clear"
                aria-label={t(uiLang, 'picker.clear')}
                onmousedown={(e) => e.preventDefault()}
                onclick={() => { query = ''; inputEl?.focus(); }}
            >
                ×
            </button>
        {/if}
    </div>

    {#if open && query_str.length >= 1 && query_str.length < MIN_CHARS}
        <div class="lang-search-hint">Type one more character…</div>
    {/if}

    {#if open && results.length > 0}
        <ul id={listboxId} class="lang-search-list" role="listbox">
            {#each results as lang, idx (lang.iso)}
                <li role="presentation">
                    <button
                        type="button"
                        role="option"
                        aria-selected={idx === highlightIdx}
                        class="lang-search-row"
                        class:highlighted={idx === highlightIdx}
                        onmousedown={(e) => { e.preventDefault(); select(lang); }}
                        onmouseenter={() => (highlightIdx = idx)}
                    >
                        <div class="lang-search-names">
                            <span class="lang-search-primary">{@html highlight(lang.name, query_str)}</span>
                            {#if lang.alt}
                                <span class="lang-search-alt">{@html highlight(lang.alt, query_str)}</span>
                            {/if}
                        </div>
                        <div class="lang-search-meta">
                            <span class="lang-search-iso">{@html highlight(lang.iso, query_str)}</span>
                            <span class="lang-search-region">{lang.regionName}</span>
                        </div>
                    </button>
                </li>
            {/each}
        </ul>
    {:else if open && query_str.length >= MIN_CHARS && results.length === 0}
        <div class="lang-search-empty">No languages match &ldquo;{query}&rdquo;</div>
    {/if}
</div>

<style>
    .lang-search {
        position: relative;
        width: 100%;
    }
    .lang-search-box {
        display: flex;
        align-items: center;
        gap: 0.55rem;
        padding: 0.6rem 0.9rem;
        border-radius: 14px;
        background: #fff;
        border: 1px solid rgba(0, 11, 99, 0.16);
        box-shadow:
            0 1px 0 rgba(0, 11, 99, 0.02),
            0 6px 22px -14px rgba(0, 11, 99, 0.25);
        transition: border-color 160ms ease, box-shadow 200ms ease;
    }
    .lang-search-box:focus-within {
        border-color: rgba(0, 11, 99, 0.55);
        box-shadow:
            0 0 0 3px rgba(0, 11, 99, 0.12),
            0 14px 30px -18px rgba(0, 11, 99, 0.35);
    }
    .lang-search-icon {
        display: grid;
        place-items: center;
        color: rgba(0, 11, 99, 0.55);
        flex-shrink: 0;
    }
    .lang-search-box input {
        flex: 1;
        border: 0;
        outline: 0;
        background: transparent;
        font-size: 1rem;
        color: rgb(0, 11, 99);
        min-width: 0;
    }
    .lang-search-box input::placeholder {
        color: rgba(0, 11, 99, 0.4);
    }
    .lang-search-box input::-webkit-search-cancel-button {
        display: none;
    }
    .lang-search-clear {
        border: 0;
        background: transparent;
        color: rgba(0, 11, 99, 0.5);
        font-size: 1.25rem;
        line-height: 1;
        cursor: pointer;
        padding: 0 0.25rem;
    }
    .lang-search-clear:hover {
        color: rgb(0, 11, 99);
    }

    .lang-search-hint,
    .lang-search-empty {
        position: absolute;
        left: 0;
        right: 0;
        top: calc(100% + 6px);
        z-index: 20;
        padding: 0.75rem 1rem;
        border-radius: 12px;
        background: #fff;
        border: 1px solid rgba(0, 11, 99, 0.1);
        box-shadow: 0 14px 30px -18px rgba(0, 11, 99, 0.3);
        color: rgba(0, 11, 99, 0.55);
        font-size: 0.9rem;
    }

    .lang-search-list {
        position: absolute;
        left: 0;
        right: 0;
        top: calc(100% + 6px);
        z-index: 20;
        max-height: 60vh;
        overflow: auto;
        list-style: none;
        margin: 0;
        padding: 0.35rem;
        border-radius: 14px;
        background: #fff;
        border: 1px solid rgba(0, 11, 99, 0.14);
        box-shadow:
            0 20px 45px -25px rgba(0, 11, 99, 0.4),
            0 4px 12px -4px rgba(0, 11, 99, 0.1);
    }
    .lang-search-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 0.75rem;
        width: 100%;
        padding: 0.55rem 0.75rem;
        border: 0;
        background: transparent;
        border-radius: 10px;
        cursor: pointer;
        text-align: left;
        color: rgb(0, 11, 99);
        transition: background 120ms ease;
    }
    .lang-search-row.highlighted {
        background: rgba(0, 11, 99, 0.07);
    }
    .lang-search-names {
        display: flex;
        flex-direction: column;
        min-width: 0;
        flex: 1;
    }
    .lang-search-primary {
        font-weight: 600;
        line-height: 1.2;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }
    .lang-search-alt {
        font-size: 0.78rem;
        color: rgba(0, 11, 99, 0.6);
        line-height: 1.25;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }
    .lang-search-meta {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        flex-shrink: 0;
        font-size: 0.75rem;
        color: rgba(0, 11, 99, 0.5);
    }
    .lang-search-iso {
        font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
        padding: 0.1rem 0.45rem;
        border-radius: 5px;
        background: rgba(0, 11, 99, 0.06);
    }
    .lang-search-region {
        font-style: italic;
    }

    :global(.lang-search mark) {
        background: rgba(0, 11, 99, 0.15);
        color: rgb(0, 11, 99);
        padding: 0 2px;
        border-radius: 3px;
    }
</style>
