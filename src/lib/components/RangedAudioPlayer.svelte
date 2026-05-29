<script lang="ts">
    import { onDestroy } from 'svelte';

    export type AudioCue = {
        /** Section index this cue plays. */
        sectionIndex: number;
        /** Chapter audio URL. Multiple cues can share the same URL. */
        audioUrl: string;
        /** Range to play within the audio file (seconds). */
        start: number;
        end: number;
    };

    type Props = {
        cues: AudioCue[];
        /** Index in the cues array currently selected (or null for none). */
        currentIdx: number | null;
        oncuechange?: (idx: number | null) => void;
    };
    let { cues, currentIdx = null, oncuechange }: Props = $props();

    let audio: HTMLAudioElement | null = $state(null);
    let playing = $state(false);
    let currentTime = $state(0);
    let duration = $state(0);
    let unlocked = $state(false);
    let activeUrl: string | null = $state(null);

    function safeOnCueChange(idx: number | null) {
        if (idx === currentIdx) return;
        oncuechange?.(idx);
    }

    function ensureAudio(): HTMLAudioElement {
        if (!audio) {
            audio = new Audio();
            audio.preload = 'auto';
            audio.addEventListener('timeupdate', onTimeUpdate);
            audio.addEventListener('loadedmetadata', () => (duration = audio?.duration ?? 0));
            audio.addEventListener('play', () => (playing = true));
            audio.addEventListener('pause', () => (playing = false));
            audio.addEventListener('ended', () => {
                playing = false;
                advance();
            });
            audio.addEventListener('error', () => {
                playing = false;
            });
        }
        return audio;
    }

    function setSrc(url: string) {
        const a = ensureAudio();
        if (activeUrl !== url) {
            a.src = url;
            activeUrl = url;
        }
    }

    async function play(idx: number) {
        const cue = cues[idx];
        if (!cue || !cue.audioUrl) return;
        const a = ensureAudio();
        unlocked = true;
        setSrc(cue.audioUrl);
        // Wait for metadata if necessary, then seek + play.
        try {
            if (Number.isNaN(a.duration) || a.readyState < 1) {
                await new Promise<void>((resolve, reject) => {
                    const onMeta = () => { a.removeEventListener('loadedmetadata', onMeta); resolve(); };
                    const onErr = () => { a.removeEventListener('error', onErr); reject(); };
                    a.addEventListener('loadedmetadata', onMeta);
                    a.addEventListener('error', onErr);
                });
            }
            a.currentTime = cue.start;
            await a.play();
            safeOnCueChange(idx);
        } catch {
            playing = false;
        }
    }

    function pause() {
        audio?.pause();
    }

    function resume() {
        if (currentIdx == null) {
            if (cues.length) void play(0);
            return;
        }
        const cue = cues[currentIdx];
        if (!cue) return;
        const a = ensureAudio();
        if (a.currentTime < cue.start || a.currentTime >= cue.end) a.currentTime = cue.start;
        void a.play();
    }

    function advance() {
        if (currentIdx == null) return;
        const next = currentIdx + 1;
        if (next < cues.length) {
            void play(next);
        } else {
            safeOnCueChange(null);
        }
    }

    function onTimeUpdate() {
        if (!audio) return;
        currentTime = audio.currentTime;
        if (currentIdx == null) return;
        const cue = cues[currentIdx];
        if (!cue) return;
        if (audio.currentTime >= cue.end) {
            audio.pause();
            advance();
        }
    }

    /** External API: jump to a specific cue. */
    export function playCue(idx: number) { void play(idx); }

    onDestroy(() => {
        if (audio) {
            audio.pause();
            audio.removeAttribute('src');
            try { audio.load(); } catch { /* noop */ }
            audio = null;
        }
    });

    const fmt = (s: number) => {
        if (!Number.isFinite(s)) return '0:00';
        const m = Math.floor(s / 60);
        const r = Math.floor(s % 60);
        return `${m}:${r.toString().padStart(2, '0')}`;
    };
    const cueLabel = $derived(
        currentIdx == null
            ? '—'
            : `${currentIdx + 1} / ${cues.length}`
    );
</script>

<div class="ranged-player" class:playing>
    <div class="ranged-player-row">
        {#if playing}
            <button class="ranged-player-btn" type="button" onclick={pause} aria-label="Pause">
                <svg viewBox="0 0 20 20" width="22" height="22" fill="currentColor">
                    <rect x="5" y="4" width="4" height="12" rx="1" />
                    <rect x="11" y="4" width="4" height="12" rx="1" />
                </svg>
            </button>
        {:else}
            <button
                class="ranged-player-btn"
                type="button"
                onclick={() => (currentIdx == null ? play(0) : resume())}
                disabled={cues.length === 0}
                aria-label={currentIdx == null ? 'Play story' : 'Resume'}
            >
                <svg viewBox="0 0 20 20" width="22" height="22" fill="currentColor">
                    <path d="M5 3.5v13l11-6.5z" />
                </svg>
            </button>
        {/if}
        <div class="ranged-player-meta">
            <div class="ranged-player-cue">{cueLabel}</div>
            <div class="ranged-player-time">{fmt(currentTime)} / {fmt(duration)}</div>
        </div>
        {#if !unlocked && cues.length > 0}
            <span class="ranged-player-hint">Toca ▶ para escuchar</span>
        {/if}
    </div>
</div>

<style>
    .ranged-player {
        position: sticky;
        bottom: 0;
        z-index: 10;
        margin: 0.5rem -0.5rem 0;
        padding: 0.6rem 0.75rem calc(0.6rem + env(safe-area-inset-bottom, 0));
        background: rgba(255, 255, 255, 0.96);
        backdrop-filter: blur(10px);
        border-top: 1px solid rgba(0, 11, 99, 0.12);
        box-shadow: 0 -10px 30px -12px rgba(0, 11, 99, 0.18);
    }
    .ranged-player-row {
        display: flex;
        align-items: center;
        gap: 0.65rem;
        max-width: 720px;
        margin: 0 auto;
    }
    .ranged-player-btn {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 44px;
        height: 44px;
        border-radius: 999px;
        border: 0;
        background: rgb(0, 11, 99);
        color: #fff;
        cursor: pointer;
        transition: transform 160ms ease, background 160ms ease;
    }
    .ranged-player-btn:hover { background: rgb(0, 9, 79); }
    .ranged-player-btn:active { transform: scale(0.96); }
    .ranged-player-btn:disabled { opacity: 0.35; cursor: default; }
    .ranged-player-meta {
        display: flex;
        flex-direction: column;
        line-height: 1.15;
        flex: 1;
        min-width: 0;
    }
    .ranged-player-cue {
        font-weight: 600;
        color: rgb(0, 11, 99);
        font-size: 0.92rem;
    }
    .ranged-player-time {
        font-size: 0.75rem;
        color: rgba(0, 11, 99, 0.55);
        font-variant-numeric: tabular-nums;
    }
    .ranged-player-hint {
        font-size: 0.75rem;
        color: rgba(0, 11, 99, 0.55);
        font-style: italic;
    }
</style>
