<script lang="ts">
    import { onMount, onDestroy } from 'svelte';
    const browser = typeof window !== "undefined";

    type Props = {
        /** URL to monitor for changes. */
        url: string;
        /** Optional headers (e.g. Authorization). */
        headers?: Record<string, string>;
        /** How often to re-check while the page is visible (ms). */
        pollIntervalMs?: number;
        /** Click handler — only fires when status === 'changed'. */
        onclick?: () => void;
        /** Solid variant: full-colour pill with white text, for placement on
         *  a dark top bar where there's no row above to host the indicator. */
        solid?: boolean;
        /** Optional Server-Sent Events endpoint. When provided, the component
         *  opens an EventSource and triggers an immediate re-check on every
         *  message. Polling continues as a fallback if the SSE connection
         *  drops or is unsupported. */
        sseUrl?: string;
    };
    let {
        url,
        headers = {},
        pollIntervalMs,
        onclick,
        solid = false,
        sseUrl
    }: Props = $props();
    // When a push channel is wired, polling is just a safety net — relax it.
    const effectivePollMs = $derived(pollIntervalMs ?? (sseUrl ? 60_000 : 10_000));

    type IndicatorState = 'idle' | 'fresh' | 'changed' | 'error';
    let status = $state<IndicatorState>('idle');
    let lastChecked = $state(0);
    /** Most recent successful response hash. Used as the new baseline when
     *  the user clicks to acknowledge a "New content" alert. */
    let currentHash = $state<string | null>(null);

    const KEY = (u: string) => `bw-doc-hash:${u}`;
    const ETAG_KEY = (u: string) => `bw-doc-etag:${u}`;
    const CHANNEL = 'bw-doc-changes';

    let timer: ReturnType<typeof setTimeout> | null = null;
    let aborter: AbortController | null = null;
    let sse: EventSource | null = null;
    let channel: BroadcastChannel | null = null;
    let etag: string | null = null;

    async function sha256Hex(text: string): Promise<string> {
        const bytes = new TextEncoder().encode(text);
        const digest = await crypto.subtle.digest('SHA-256', bytes);
        return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
    }

    function loadBaseline(): string | null {
        if (!browser) return null;
        try { return localStorage.getItem(KEY(url)); } catch { return null; }
    }
    function saveBaseline(hash: string) {
        if (!browser) return;
        try { localStorage.setItem(KEY(url), hash); } catch { /* silent */ }
    }
    function loadEtag(): string | null {
        if (!browser) return null;
        try { return localStorage.getItem(ETAG_KEY(url)); } catch { return null; }
    }
    function saveEtag(t: string | null) {
        if (!browser) return;
        try {
            if (t) localStorage.setItem(ETAG_KEY(url), t);
            else localStorage.removeItem(ETAG_KEY(url));
        } catch { /* silent */ }
    }

    async function check() {
        if (!browser) return;
        if (aborter) aborter.abort();
        aborter = new AbortController();
        try {
            // Conditional request — if the server supplies an ETag we round-trip
            // it as If-None-Match, so unchanged docs come back as 304 with no
            // body. CORS may strip the response ETag header unless the server
            // adds Access-Control-Expose-Headers: ETag — in that case the
            // conditional path is silently skipped and we just fetch the body.
            const reqHeaders: Record<string, string> = { ...headers };
            const cachedEtag = etag ?? loadEtag();
            if (cachedEtag) reqHeaders['If-None-Match'] = cachedEtag;

            const r = await fetch(url, {
                cache: 'no-cache',
                headers: reqHeaders,
                signal: aborter.signal
            });
            // 2xx = success, 304 = unchanged (etag), 4xx = deterministic
            // client-side response (e.g. "file does not exist yet" — still a
            // valid baseline). 5xx / network errors aren't usable.
            if (r.status >= 500) { status = 'error'; return; }

            if (r.status === 304) {
                // Body unchanged — baseline still matches whatever we last saw.
                status = 'fresh';
                lastChecked = Date.now();
                return;
            }

            const newEtag = r.headers.get('ETag');
            if (newEtag) {
                etag = newEtag;
                saveEtag(newEtag);
            }

            const text = await r.text();
            const hash = await sha256Hex(text);
            currentHash = hash;
            const baseline = loadBaseline();
            if (baseline === null) {
                saveBaseline(hash);
                status = 'fresh';
            } else if (baseline === hash) {
                status = 'fresh';
            } else {
                status = 'changed';
                channel?.postMessage({ kind: 'changed', url });
            }
            lastChecked = Date.now();
        } catch (e) {
            if ((e as Error).name === 'AbortError') return;
            status = 'error';
        }
    }

    function schedule() {
        if (timer != null) return;
        timer = setTimeout(async () => {
            timer = null;
            if (browser && document.visibilityState === 'visible') {
                await check();
            }
            schedule();
        }, effectivePollMs);
    }

    function onVisibility() {
        if (browser && document.visibilityState === 'visible') check();
    }

    onMount(() => {
        // Cross-tab sync: if a sibling tab observes a change OR acknowledges
        // one, we re-derive our own state from the (now-updated) localStorage
        // baseline by triggering an immediate check.
        if (typeof BroadcastChannel !== 'undefined') {
            channel = new BroadcastChannel(CHANNEL);
            channel.onmessage = (e) => {
                if (e.data?.url === url) check();
            };
        }

        // Push channel — server contract:
        //   event: change
        //   id:    <monotonic id, used by EventSource for Last-Event-ID resume>
        //   data:  {"hash":"<sha256-hex of new body>"}   (optional)
        //
        // If the message carries a hash we can update the indicator with no
        // follow-up GET; otherwise we trigger a re-check. EventSource handles
        // automatic reconnection on its own, so polling is purely a safety net.
        if (sseUrl && typeof EventSource !== 'undefined') {
            try {
                // No `withCredentials` — Pankosmia replies `Allow-Origin: *`
                // and rejects credentialed requests; the endpoint is public.
                sse = new EventSource(sseUrl);
                sse.addEventListener('change', (ev: MessageEvent) => {
                    let pushedHash: string | null = null;
                    try {
                        const data = ev.data ? JSON.parse(ev.data) : null;
                        if (data && typeof data.hash === 'string') pushedHash = data.hash;
                    } catch { /* unparseable payload — fall through to refetch */ }

                    if (pushedHash) {
                        currentHash = pushedHash;
                        const baseline = loadBaseline();
                        if (baseline === null) {
                            saveBaseline(pushedHash);
                            status = 'fresh';
                        } else if (baseline === pushedHash) {
                            status = 'fresh';
                        } else {
                            status = 'changed';
                            channel?.postMessage({ kind: 'changed', url });
                        }
                        lastChecked = Date.now();
                    } else {
                        check();
                    }
                });
                // Generic fallback if the server doesn't use named events:
                sse.onmessage = () => check();
                // sse.onerror — intentionally silent; EventSource auto-reconnects
                // and the polling fallback covers extended outages.
            } catch { /* fall back to polling */ }
        }

        check();
        schedule();
        document.addEventListener('visibilitychange', onVisibility);
        window.addEventListener('focus', onVisibility);
    });

    onDestroy(() => {
        if (timer != null) { clearTimeout(timer); timer = null; }
        if (aborter) { aborter.abort(); aborter = null; }
        if (sse) { sse.close(); sse = null; }
        if (channel) { channel.close(); channel = null; }
        if (browser) {
            document.removeEventListener('visibilitychange', onVisibility);
            window.removeEventListener('focus', onVisibility);
        }
    });

    const tooltip = $derived(
        status === 'changed'
            ? `Documento actualizado — clic para marcar como visto${lastChecked ? ` · ${new Date(lastChecked).toLocaleTimeString()}` : ''}`
            : status === 'fresh'
              ? `Sin cambios${lastChecked ? ` · ${new Date(lastChecked).toLocaleTimeString()}` : ''}`
              : status === 'error'
                ? 'No se pudo consultar el documento'
                : 'Comprobando…'
    );

    const label = $derived(
        status === 'changed' ? 'New content' : status === 'error' ? 'Error' : ''
    );

    function handleClick() {
        if (status !== 'changed') return;
        // Acknowledge: re-baseline against the response we just saw, so the
        // dot only goes green again on the NEXT distinct change. Broadcast
        // so sibling tabs reset their dot too.
        if (currentHash) saveBaseline(currentHash);
        status = 'fresh';
        channel?.postMessage({ kind: 'acknowledged', url });
        onclick?.();
    }
</script>

<button
    type="button"
    class="change-indicator"
    class:solid
    class:status-idle={status === 'idle'}
    class:status-fresh={status === 'fresh'}
    class:status-changed={status === 'changed'}
    class:status-error={status === 'error'}
    onclick={handleClick}
    disabled={status !== 'changed'}
    aria-label={tooltip}
    title={tooltip}
>
    <span class="dot" aria-hidden="true"></span>
    {#if label}
        <span class="label">{label}</span>
    {/if}
</button>

<style>
    .change-indicator {
        display: inline-flex;
        align-items: center;
        gap: 0.55rem;
        min-height: 36px;
        padding: 0 0.55rem;
        border: 0;
        background: transparent;
        cursor: default;
        border-radius: 999px;
        font-size: 0.85rem;
        font-weight: 600;
        letter-spacing: 0.01em;
        color: rgba(0, 11, 99, 0.55);
        transition: background 160ms ease, color 160ms ease;
    }
    .change-indicator:not(:disabled) { cursor: pointer; }
    .change-indicator:focus-visible {
        outline: 2px solid rgb(0, 11, 99);
        outline-offset: 2px;
    }

    .dot {
        width: 14px;
        height: 14px;
        border-radius: 999px;
        background: rgba(0, 11, 99, 0.3);
        box-shadow: 0 0 0 2px rgba(0, 11, 99, 0.06);
        transition: background 200ms ease, box-shadow 220ms ease, transform 200ms ease;
        flex-shrink: 0;
    }
    .label { white-space: nowrap; }

    /* Idle / fresh: bare gray dot, no text. */
    .status-idle,
    .status-fresh { background: transparent; }

    /* Error: amber pill with text. */
    .status-error {
        color: rgb(146 64 14);
        background: rgba(217, 119, 6, 0.12);
    }
    .status-error .dot {
        background: rgb(217 119 6);
        box-shadow: 0 0 0 2px rgba(217, 119, 6, 0.18);
    }

    /* Changed: green pill, clickable, gentle pulse. */
    .status-changed {
        color: rgb(21 128 61);
        background: rgba(34, 197, 94, 0.14);
    }
    .status-changed .dot {
        background: rgb(34, 197, 94);
        box-shadow:
            0 0 0 3px rgba(34, 197, 94, 0.25),
            0 4px 10px -2px rgba(34, 197, 94, 0.45);
        animation: pulse 1.6s ease-in-out infinite;
    }
    .change-indicator.status-changed:hover {
        background: rgba(34, 197, 94, 0.22);
    }
    .change-indicator.status-changed:hover .dot { transform: scale(1.1); }

    @keyframes pulse {
        0%, 100% { box-shadow: 0 0 0 3px rgba(34, 197, 94, 0.25), 0 4px 10px -2px rgba(34, 197, 94, 0.45); }
        50%      { box-shadow: 0 0 0 9px rgba(34, 197, 94, 0),    0 4px 10px -2px rgba(34, 197, 94, 0.4); }
    }
    @media (prefers-reduced-motion: reduce) {
        .status-changed .dot { animation: none; }
    }

    /* Solid variant — full-colour pill with white text + dot. Used when the
     * indicator sits on the very top bar with no row above it. */
    .change-indicator.solid.status-error {
        background: rgb(217, 119, 6);
        color: #fff;
    }
    .change-indicator.solid.status-error .dot {
        background: #fff;
        box-shadow: 0 0 0 2px rgba(255, 255, 255, 0.45);
    }
    .change-indicator.solid.status-changed {
        background: rgb(22, 163, 74);
        color: #fff;
    }
    .change-indicator.solid.status-changed .dot {
        background: #fff;
        box-shadow:
            0 0 0 3px rgba(255, 255, 255, 0.5),
            0 4px 10px -2px rgba(0, 0, 0, 0.25);
        animation: pulse-solid 1.6s ease-in-out infinite;
    }
    .change-indicator.solid.status-changed:hover {
        background: rgb(21 128 61);
    }
    @keyframes pulse-solid {
        0%, 100% { box-shadow: 0 0 0 3px rgba(255, 255, 255, 0.5), 0 4px 10px -2px rgba(0, 0, 0, 0.25); }
        50%      { box-shadow: 0 0 0 9px rgba(255, 255, 255, 0),   0 4px 10px -2px rgba(0, 0, 0, 0.2); }
    }
    @media (prefers-reduced-motion: reduce) {
        .change-indicator.solid.status-changed .dot { animation: none; }
    }
</style>
