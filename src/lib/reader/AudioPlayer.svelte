<script lang="ts">
    /**
     * Compact audio player matching SE's bespoke bar: rewind-15 / play-pause /
     * forward-15 / playback-speed / scrubbable progress bar / time label. Uses
     * a plain HTMLAudioElement under the hood (no Web Audio API), so it works
     * everywhere and costs nothing to instantiate.
     */
    type Props = {
        src: string;
        label?: string;
    };
    let { src, label = '' }: Props = $props();

    let audioEl = $state<HTMLAudioElement | null>(null);
    let playing = $state(false);
    let currentTime = $state(0);
    let duration = $state(0);
    let rate = $state(1);

    const RATES = [0.75, 1, 1.25, 1.5, 2] as const;

    function togglePlay() {
        if (!audioEl) return;
        if (audioEl.paused) audioEl.play().catch(() => {});
        else audioEl.pause();
    }
    function skip(seconds: number) {
        if (!audioEl) return;
        const max = Number.isFinite(duration) && duration > 0 ? duration : audioEl.currentTime + 60;
        audioEl.currentTime = Math.max(0, Math.min(max, audioEl.currentTime + seconds));
    }
    function cycleRate() {
        if (!audioEl) return;
        const idx = RATES.findIndex((r) => r === rate);
        rate = RATES[(idx + 1) % RATES.length];
        audioEl.playbackRate = rate;
    }
    function seek(e: MouseEvent) {
        if (!audioEl || !duration) return;
        const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
        const frac = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
        audioEl.currentTime = frac * duration;
    }
    function seekKey(e: KeyboardEvent) {
        if (!audioEl || !duration) return;
        if (e.key === 'ArrowLeft') {
            e.preventDefault();
            skip(-5);
        } else if (e.key === 'ArrowRight') {
            e.preventDefault();
            skip(5);
        }
    }
    function fmtTime(s: number): string {
        if (!Number.isFinite(s) || s < 0) return '–:––';
        const m = Math.floor(s / 60);
        const sec = Math.floor(s % 60);
        return `${m}:${String(sec).padStart(2, '0')}`;
    }
</script>

<div class="audio-player">
    <audio
        bind:this={audioEl}
        {src}
        preload="metadata"
        onplay={() => (playing = true)}
        onpause={() => (playing = false)}
        ontimeupdate={() => audioEl && (currentTime = audioEl.currentTime)}
        onloadedmetadata={() => audioEl && (duration = audioEl.duration)}
        onended={() => (playing = false)}
    ></audio>

    {#if label}
        <div class="ap-label">{label}</div>
    {/if}

    <div class="ap-controls">
        <button
            type="button"
            class="ap-btn"
            onclick={() => skip(-15)}
            aria-label="Rewind 15 seconds"
            title="Rewind 15 seconds"
        >
            ↺15
        </button>
        <button
            type="button"
            class="ap-btn ap-play"
            onclick={togglePlay}
            aria-label={playing ? 'Pause' : 'Play'}
            title={playing ? 'Pause' : 'Play'}
        >
            {playing ? '❚❚' : '▶'}
        </button>
        <button
            type="button"
            class="ap-btn"
            onclick={() => skip(15)}
            aria-label="Forward 15 seconds"
            title="Forward 15 seconds"
        >
            15↻
        </button>
        <button
            type="button"
            class="ap-btn ap-rate"
            onclick={cycleRate}
            aria-label="Playback speed"
            title="Playback speed"
        >
            {rate}×
        </button>
    </div>

    <div
        class="ap-progress"
        role="slider"
        tabindex="0"
        aria-label="Seek"
        aria-valuemin="0"
        aria-valuemax={duration || 0}
        aria-valuenow={currentTime}
        onclick={seek}
        onkeydown={seekKey}
    >
        <div class="ap-fill" style={`width:${duration ? (currentTime / duration) * 100 : 0}%`}></div>
    </div>

    <div class="ap-time tabular-nums">
        {fmtTime(currentTime)} / {fmtTime(duration)}
    </div>
</div>
