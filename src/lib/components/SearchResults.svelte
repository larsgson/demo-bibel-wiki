<script lang="ts">
    import { onMount, tick } from 'svelte';
    import { isApiConfigured, ApiNotConfiguredError, search, ask } from '../api';
    import type { AskResponse, Citation, SearchHit, SearchResponse } from '../api/types';

    type Props = {
        initialQuery: string;
        initialMode: 'free' | 'premium';
        iso: string;
    };
    let { initialQuery, initialMode, iso }: Props = $props();

    import { t } from '../bw/ui-locales';
    import { uiLangForRegion } from '../data/region-config';
    import { $activeRegion as activeRegionStore } from '../../stores/region-store';
    const uiLang = uiLangForRegion(activeRegionStore.get());

    const PW_KEY = 'premium_password';
    const MODE_KEY = 'search_mode';
    const HISTORY_KEY = 'search_history';

    type Result =
        | { kind: 'search'; data: SearchResponse }
        | { kind: 'ask'; data: AskResponse };

    type Turn = {
        query: string;
        mode: 'free' | 'premium';
        result: Result | null;
        error: string | null;
        loading: boolean;
        freeHits?: SearchResponse | null;
        freeLoading?: boolean;
    };

    let turns = $state<Turn[]>([]);
    let inputValue = $state('');
    let mode = $state<'free' | 'premium'>('free');
    let password = $state('');
    let showPasswordModal = $state(false);
    let mounted = $state(false);
    let scrollContainer: HTMLElement | undefined = $state();
    let expandedTurns = $state(new Set<number>());

    function loadHistory(): Turn[] {
        try {
            const raw = sessionStorage.getItem(HISTORY_KEY);
            if (!raw) return [];
            const parsed = JSON.parse(raw) as Turn[];
            return parsed.filter((t) => !t.loading);
        } catch {
            return [];
        }
    }

    function saveHistory() {
        try {
            const saveable = turns.filter((t) => !t.loading);
            sessionStorage.setItem(HISTORY_KEY, JSON.stringify(saveable));
        } catch { /* quota */ }
    }

    onMount(() => {
        mode = localStorage.getItem(MODE_KEY) === 'premium' ? 'premium' : 'free';
        password = sessionStorage.getItem(PW_KEY) ?? '';
        turns = loadHistory();
        mounted = true;

        const urlQuery = new URLSearchParams(window.location.search).get('q')?.trim() || '';
        if (urlQuery && !turns.some((t) => t.query === urlQuery && t.mode === mode)) {
            submitQuery(urlQuery);
        }

        tick().then(scrollToBottom);
    });

    async function scrollToBottom() {
        await tick();
        scrollContainer?.scrollTo({ top: scrollContainer.scrollHeight, behavior: 'smooth' });
    }

    function submitQuery(q?: string) {
        const query = (q ?? inputValue).trim();
        if (!query) return;
        inputValue = '';

        if (!isApiConfigured()) {
            turns = [...turns, { query, mode, result: null, error: 'API base URL is not configured. Set PUBLIC_API_BASE_URL in your environment.', loading: false }];
            saveHistory();
            scrollToBottom();
            return;
        }
        if (mode === 'premium' && !password) {
            turns = [...turns, { query, mode, result: null, error: 'Premium requires a password. Toggle Premium to enter one.', loading: false }];
            saveHistory();
            scrollToBottom();
            return;
        }

        const turnIdx = turns.length;
        turns = [...turns, { query, mode, result: null, error: null, loading: true }];
        scrollToBottom();

        const promise =
            mode === 'premium'
                ? ask({ question: query, lang: 'en', password }).then(
                      (data) => ({ kind: 'ask', data }) as Result
                  )
                : search({ q: query, lang: 'en', top_k: 10 }).then(
                      (data) => ({ kind: 'search', data }) as Result
                  );

        promise
            .then((res) => {
                turns[turnIdx] = { ...turns[turnIdx], result: res, loading: false };
                saveHistory();
                scrollToBottom();
            })
            .catch((err) => {
                let errorMsg: string;
                if (err instanceof ApiNotConfiguredError) {
                    errorMsg = err.detail;
                } else if (err?.code === 'network') {
                    errorMsg = 'Network error reaching the API. The backend may not allow this origin (CORS).';
                } else if (err?.status === 401 || err?.status === 403) {
                    errorMsg = 'Password rejected by the server. Please re-enter.';
                    sessionStorage.removeItem(PW_KEY);
                } else {
                    errorMsg = err?.detail || err?.message || 'Request failed.';
                }
                turns[turnIdx] = { ...turns[turnIdx], error: errorMsg, loading: false };
                saveHistory();
                scrollToBottom();
            });
    }

    function toggleMode() {
        if (mode === 'free') {
            mode = 'premium';
            localStorage.setItem(MODE_KEY, 'premium');
            const saved = sessionStorage.getItem(PW_KEY);
            if (saved) {
                password = saved;
            } else {
                showPasswordModal = true;
            }
        } else {
            mode = 'free';
            localStorage.setItem(MODE_KEY, 'free');
        }
    }

    function savePassword(pw: string) {
        password = pw;
        sessionStorage.setItem(PW_KEY, pw);
        showPasswordModal = false;
    }

    function clearHistory() {
        turns = [];
        sessionStorage.removeItem(HISTORY_KEY);
    }

    function renderAnswer(answer: string, citations: Citation[]): { text: string; link: string | null }[] {
        const idToN = new Map(citations.map((c) => [c.chunk_id, c.n]));
        const parts: { text: string; link: string | null }[] = [];
        const re = /\[([A-Za-z0-9:_-]+)\]/g;
        let lastIdx = 0;
        let m: RegExpExecArray | null;
        while ((m = re.exec(answer)) !== null) {
            const [full, id] = m;
            const n = idToN.get(id);
            if (m.index > lastIdx) parts.push({ text: answer.slice(lastIdx, m.index), link: null });
            if (n) {
                parts.push({ text: `[${n}]`, link: `#cite-${n}` });
            } else {
                parts.push({ text: full, link: null });
            }
            lastIdx = m.index + full.length;
        }
        if (lastIdx < answer.length) parts.push({ text: answer.slice(lastIdx), link: null });
        return parts;
    }

    function confidenceColor(c: AskResponse['confidence']): string {
        return c === 'high' ? 'rgb(0, 11, 99)' : c === 'medium' ? 'rgb(100, 100, 140)' : 'rgb(180, 80, 20)';
    }
</script>

<div class="chat-shell">
    <!-- Scrollable conversation area -->
    <div class="chat-scroll" bind:this={scrollContainer}>
        {#if !mounted}
            <p class="chat-empty">Loading…</p>
        {:else if turns.length === 0}
            <div class="chat-welcome">
                <div class="chat-welcome-icon">💬</div>
                <p class="chat-welcome-text">
                    {mode === 'premium' ? 'Ask a question about the Bible' : 'Search the Bible'}
                </p>
                <p class="chat-welcome-hint">
                    {mode === 'premium' ? 'AI-powered answers with citations' : 'Free keyword search across scripture resources'}
                </p>
            </div>
        {:else}
            {#each turns as turn, ti (ti)}
                <!-- User bubble -->
                <div class="chat-bubble user-bubble">
                    <span class="bubble-mode">{turn.mode}</span>
                    <span class="bubble-query">{turn.query}</span>
                </div>

                <!-- Response -->
                {#if turn.loading}
                    <div class="chat-bubble ai-bubble">
                        <span class="loading-dots">
                            {turn.mode === 'premium' ? 'Thinking…' : 'Searching…'}
                        </span>
                    </div>
                {:else if turn.error}
                    <div class="chat-bubble ai-bubble error-bubble">
                        <p class="bubble-error-title">Request failed</p>
                        <p class="bubble-error-msg">{turn.error}</p>
                    </div>
                {:else if turn.result?.kind === 'search'}
                    {@const hits = turn.result.data.hits}
                    <div class="chat-bubble ai-bubble">
                        {#if hits.length === 0}
                            <p class="bubble-empty">No results for "{turn.query}".</p>
                        {:else}
                            {@const expanded = expandedTurns.has(ti)}
                            {@const visible = expanded ? hits : hits.slice(0, 3)}
                            {@const remaining = hits.length - 3}
                            <p class="bubble-summary">{turn.result.data.total ?? hits.length} result{hits.length === 1 ? '' : 's'}</p>
                            {#each visible as hit (hit.chunk_id)}
                                <article class="hit-card">
                                    <h3 class="hit-title">
                                        <a href={`/${iso}/c/${encodeURIComponent(hit.chunk_id)}`}>{hit.title}</a>
                                    </h3>
                                    {#if hit.passage}
                                        <p class="hit-passage">{hit.passage}</p>
                                    {/if}
                                    <p class="hit-excerpt">{hit.excerpt}</p>
                                    <div class="hit-footer">
                                        <span class="hit-kind">{hit.kind}</span>
                                        <span class="hit-score">score: {hit.score.toFixed(3)}</span>
                                    </div>
                                </article>
                            {/each}
                            {#if remaining > 0 && !expanded}
                                <button
                                    class="show-more-btn"
                                    type="button"
                                    onclick={() => { expandedTurns.add(ti); expandedTurns = new Set(expandedTurns); }}
                                >
                                    Show {remaining} more result{remaining === 1 ? '' : 's'}
                                </button>
                            {/if}
                        {/if}
                    </div>
                {:else if turn.result?.kind === 'ask'}
                    {@const resp = turn.result.data}
                    {@const parts = renderAnswer(resp.answer, resp.citations)}
                    <div class="chat-bubble ai-bubble">
                        <div class="answer-meta">
                            <span class="confidence-badge" style="background:{confidenceColor(resp.confidence)}">{resp.confidence}</span>
                            <span class="cite-count">{resp.citations.length} citation{resp.citations.length === 1 ? '' : 's'}</span>
                        </div>
                        <div class="answer-body">
                            {#each parts as part}
                                {#if part.link}
                                    <sup><a class="cite-ref" href={part.link}>{part.text}</a></sup>
                                {:else}{part.text}{/if}
                            {/each}
                        </div>
                        {#if resp.citations.length > 0}
                            <details class="citations-details">
                                <summary class="citations-summary">Show {resp.citations.length} source{resp.citations.length === 1 ? '' : 's'}</summary>
                                <ol class="citations-list">
                                    {#each resp.citations as c (c.chunk_id)}
                                        <li class="citation-item" id="cite-{c.n}">
                                            <span class="citation-n">[{c.n}]</span>
                                            <div class="citation-body">
                                                <a class="citation-title" href={`/${iso}/c/${encodeURIComponent(c.chunk_id)}`}>{c.title}</a>
                                                {#if c.passage}
                                                    <span class="citation-passage">{c.passage}</span>
                                                {/if}
                                                <p class="citation-excerpt">{c.excerpt}</p>
                                            </div>
                                        </li>
                                    {/each}
                                </ol>
                            </details>
                        {/if}
                    </div>
                {/if}
            {/each}
        {/if}
    </div>

    <!-- Bottom input bar -->
    <div class="chat-input-bar">
        {#if turns.length > 0}
            <button class="clear-btn" type="button" onclick={clearHistory} title={t(uiLang, 'study.clearHistory')}>
                ×
            </button>
        {/if}
        <form class="chat-form" onsubmit={(e) => { e.preventDefault(); submitQuery(); }}>
            <input
                class="chat-input"
                type="text"
                bind:value={inputValue}
                placeholder={mode === 'premium' ? 'Ask a question…' : 'Search the Bible…'}
            />
            <button class="chat-send" type="submit" disabled={!inputValue.trim()}>
                ➤
            </button>
        </form>
        <button
            class="mode-toggle"
            class:premium={mode === 'premium'}
            type="button"
            onclick={toggleMode}
            title={mode === 'premium' ? 'Switch to free search' : 'Switch to premium AI'}
        >
            {mode === 'premium' ? 'AI' : 'Free'}
        </button>
    </div>
</div>

<!-- Password modal -->
{#if showPasswordModal}
    <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
    <div class="modal-backdrop" role="presentation" onclick={() => (showPasswordModal = false)} onkeydown={(e) => { if (e.key === 'Escape') showPasswordModal = false; }}>
        <div class="modal-box" role="dialog" aria-modal="true" tabindex="-1" onclick={(e) => e.stopPropagation()} onkeydown={() => {}}>
            <h3 class="modal-title">Enter premium password</h3>
            <form onsubmit={(e) => {
                e.preventDefault();
                const fd = new FormData(e.currentTarget);
                savePassword(fd.get('pw') as string);
            }}>
                <input class="modal-input" type="password" name="pw" placeholder={t(uiLang, 'study.passwordPlaceholder')} autocomplete="off" />
                <div class="modal-actions">
                    <button type="button" class="modal-cancel" onclick={() => { showPasswordModal = false; mode = 'free'; localStorage.setItem(MODE_KEY, 'free'); }}>Cancel</button>
                    <button type="submit" class="modal-ok">OK</button>
                </div>
            </form>
        </div>
    </div>
{/if}

<style>
    .chat-shell {
        max-width: 700px;
        margin: 0 auto;
        padding-bottom: 4.5rem;
    }

    /* Conversation area — normal flow, not fixed height */
    .chat-scroll {
        display: flex;
        flex-direction: column;
        gap: 0.6rem;
        padding: 0.5rem 0 1rem;
        min-height: 40vh;
    }

    .chat-welcome {
        flex: 1;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 0.3rem;
        color: rgba(0, 11, 99, 0.5);
    }
    .chat-welcome-icon { font-size: 2.5rem; margin-bottom: 0.5rem; }
    .chat-welcome-text { font-size: 1.1rem; font-weight: 600; color: rgb(0, 11, 99); margin: 0; }
    .chat-welcome-hint { font-size: 0.85rem; margin: 0; }
    .chat-empty { color: rgba(0, 11, 99, 0.5); font-size: 0.9rem; }

    /* Bubbles */
    .chat-bubble {
        max-width: 88%;
        padding: 0.65rem 0.85rem;
        border-radius: 14px;
        line-height: 1.45;
        font-size: 0.9rem;
    }
    .user-bubble {
        align-self: flex-end;
        background: rgb(0, 11, 99);
        color: #fff;
        border-bottom-right-radius: 4px;
        display: flex;
        align-items: baseline;
        gap: 0.5rem;
    }
    .bubble-mode {
        font-size: 0.65rem;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.04em;
        opacity: 0.6;
        flex-shrink: 0;
    }
    .bubble-query { word-break: break-word; }
    .ai-bubble {
        align-self: flex-start;
        background: rgba(0, 11, 99, 0.05);
        color: rgb(0, 11, 99);
        border-bottom-left-radius: 4px;
    }
    .error-bubble {
        background: rgba(217, 119, 6, 0.08);
        border: 1px solid rgba(217, 119, 6, 0.25);
    }
    .bubble-error-title { font-weight: 600; color: rgb(180, 80, 20); font-size: 0.82rem; margin: 0 0 0.2rem; }
    .bubble-error-msg { color: rgb(0, 11, 99); font-size: 0.85rem; margin: 0; }
    .bubble-empty { color: rgba(0, 11, 99, 0.6); margin: 0; }
    .bubble-summary { font-size: 0.8rem; color: rgba(0, 11, 99, 0.55); margin: 0 0 0.5rem; font-weight: 600; }
    .loading-dots { color: rgba(0, 11, 99, 0.55); font-style: italic; }

    /* Hit cards inside AI bubble */
    .hit-card {
        border: 1px solid rgba(0, 11, 99, 0.1);
        border-radius: 8px;
        padding: 0.6rem;
        margin-bottom: 0.5rem;
        background: #fff;
    }
    .hit-card:last-child { margin-bottom: 0; }
    .hit-title { margin: 0 0 0.2rem; font-size: 0.88rem; }
    .hit-title a {
        color: rgb(0, 11, 99);
        text-decoration: none;
        font-weight: 600;
    }
    .hit-title a:hover { text-decoration: underline; }
    .hit-passage { font-size: 0.78rem; color: rgba(0, 11, 99, 0.55); margin: 0 0 0.2rem; }
    .hit-excerpt { font-size: 0.82rem; color: rgb(0, 11, 99); line-height: 1.5; margin: 0 0 0.35rem; }
    .hit-footer { display: flex; align-items: center; gap: 0.5rem; font-size: 0.7rem; }
    .hit-kind {
        padding: 1px 6px;
        background: rgba(0, 11, 99, 0.08);
        color: rgb(0, 11, 99);
        border-radius: 3px;
        font-weight: 500;
    }
    .hit-score { color: rgba(0, 11, 99, 0.4); }
    .show-more-btn {
        width: 100%;
        padding: 0.5rem;
        border: 1px dashed rgba(0, 11, 99, 0.2);
        border-radius: 8px;
        background: transparent;
        color: rgb(0, 11, 99);
        font: inherit;
        font-size: 0.82rem;
        font-weight: 600;
        cursor: pointer;
        transition: background 160ms ease, border-color 160ms ease;
    }
    .show-more-btn:hover {
        background: rgba(0, 11, 99, 0.04);
        border-color: rgba(0, 11, 99, 0.35);
    }

    /* Answer */
    .answer-meta {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        margin-bottom: 0.5rem;
    }
    .confidence-badge {
        display: inline-block;
        padding: 1px 7px;
        font-size: 0.65rem;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.04em;
        color: #fff;
        border-radius: 3px;
    }
    .cite-count { font-size: 0.75rem; color: rgba(0, 11, 99, 0.5); }
    .answer-body {
        font-size: 0.88rem;
        line-height: 1.6;
        white-space: pre-wrap;
    }
    .cite-ref {
        color: rgb(0, 11, 99);
        text-decoration: none;
        font-size: 0.72rem;
        padding: 0 1px;
    }
    .cite-ref:hover { text-decoration: underline; }

    /* Citations collapsible */
    .citations-details { margin-top: 0.6rem; }
    .citations-summary {
        display: block;
        width: 100%;
        padding: 0.5rem;
        border: 1px dashed rgba(0, 11, 99, 0.25);
        border-radius: 8px;
        background: transparent;
        font-size: 0.82rem;
        font-weight: 600;
        color: rgb(0, 11, 99);
        cursor: pointer;
        user-select: none;
        text-align: center;
        transition: background 160ms ease, border-color 160ms ease;
        list-style: none;
    }
    .citations-summary::-webkit-details-marker { display: none; }
    .citations-summary:hover {
        background: rgba(0, 11, 99, 0.04);
        border-color: rgba(0, 11, 99, 0.4);
    }
    .citations-details[open] > .citations-summary {
        margin-bottom: 0.5rem;
        border-style: solid;
        border-color: rgba(0, 11, 99, 0.15);
    }
    .citations-list {
        list-style: none;
        padding: 0;
        margin: 0.4rem 0 0;
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
    }
    .citation-item {
        display: flex;
        gap: 0.4rem;
        align-items: flex-start;
        padding: 0.5rem;
        border-radius: 6px;
        background: #fff;
        border: 1px solid rgba(0, 11, 99, 0.08);
    }
    .citation-n { font-size: 0.7rem; font-family: monospace; color: rgba(0, 11, 99, 0.45); min-width: 1.3rem; }
    .citation-body { flex: 1; }
    .citation-title { color: rgb(0, 11, 99); font-weight: 600; font-size: 0.82rem; text-decoration: none; }
    .citation-title:hover { text-decoration: underline; }
    .citation-passage { font-size: 0.7rem; color: rgba(0, 11, 99, 0.5); margin-left: 0.3rem; }
    .citation-excerpt { font-size: 0.78rem; color: rgb(0, 11, 99); line-height: 1.45; margin: 2px 0 0; }

    /* Bottom input bar — sticky at viewport bottom */
    .chat-input-bar {
        position: fixed;
        bottom: 0;
        left: 0;
        right: 0;
        display: flex;
        align-items: center;
        gap: 0.4rem;
        padding: 0.6rem 1rem;
        border-top: 1px solid rgba(0, 11, 99, 0.1);
        background: rgba(255, 255, 255, 0.97);
        backdrop-filter: blur(8px);
        z-index: 50;
        max-width: 700px;
        margin: 0 auto;
        box-sizing: border-box;
    }
    .chat-form {
        display: flex;
        flex: 1;
        gap: 0;
    }
    .chat-input {
        flex: 1;
        padding: 0.55rem 0.75rem;
        border: 1px solid rgba(0, 11, 99, 0.2);
        border-right: 0;
        border-radius: 20px 0 0 20px;
        font: inherit;
        font-size: 0.9rem;
        color: rgb(0, 11, 99);
        outline: none;
    }
    .chat-input:focus { border-color: rgb(0, 11, 99); }
    .chat-send {
        padding: 0.55rem 0.75rem;
        border: 1px solid rgb(0, 11, 99);
        border-radius: 0 20px 20px 0;
        background: rgb(0, 11, 99);
        color: #fff;
        font-size: 1rem;
        cursor: pointer;
        line-height: 1;
    }
    .chat-send:disabled { opacity: 0.4; cursor: default; }
    .chat-send:hover:not(:disabled) { opacity: 0.9; }

    .mode-toggle {
        padding: 0.45rem 0.6rem;
        border: 1px solid rgba(0, 11, 99, 0.2);
        border-radius: 20px;
        background: transparent;
        font: inherit;
        font-size: 0.75rem;
        font-weight: 700;
        color: rgb(0, 11, 99);
        cursor: pointer;
        white-space: nowrap;
        flex-shrink: 0;
    }
    .mode-toggle.premium {
        background: rgb(0, 11, 99);
        color: #fff;
        border-color: rgb(0, 11, 99);
    }

    .clear-btn {
        width: 28px;
        height: 28px;
        border: none;
        background: rgba(0, 11, 99, 0.06);
        color: rgba(0, 11, 99, 0.5);
        border-radius: 999px;
        font-size: 1rem;
        cursor: pointer;
        display: grid;
        place-items: center;
        flex-shrink: 0;
    }
    .clear-btn:hover { background: rgba(0, 11, 99, 0.12); color: rgb(0, 11, 99); }

    /* Modal */
    .modal-backdrop {
        position: fixed;
        inset: 0;
        background: rgba(0, 0, 0, 0.4);
        display: grid;
        place-items: center;
        z-index: 100;
    }
    .modal-box {
        background: #fff;
        border-radius: 12px;
        padding: 1.5rem;
        width: min(360px, 90vw);
        box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
    }
    .modal-title {
        font-size: 1.1rem;
        font-weight: 700;
        color: rgb(0, 11, 99);
        margin: 0 0 1rem;
    }
    .modal-input {
        width: 100%;
        padding: 0.6rem;
        border: 1px solid rgba(0, 11, 99, 0.2);
        border-radius: 6px;
        font: inherit;
        margin-bottom: 1rem;
        box-sizing: border-box;
    }
    .modal-actions {
        display: flex;
        justify-content: flex-end;
        gap: 0.5rem;
    }
    .modal-cancel, .modal-ok {
        padding: 0.4rem 1rem;
        border-radius: 6px;
        font: inherit;
        font-weight: 600;
        cursor: pointer;
        border: 1px solid rgba(0, 11, 99, 0.2);
    }
    .modal-cancel { background: transparent; color: rgb(0, 11, 99); }
    .modal-ok { background: rgb(0, 11, 99); color: #fff; border-color: rgb(0, 11, 99); }
</style>
