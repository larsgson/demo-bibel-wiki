<script lang="ts">
    import { settings, type Theme } from './settings';

    let { onclose }: { onclose: () => void } = $props();

    const THEMES: Array<{ value: Theme; label: string }> = [
        { value: 'light', label: 'Light' },
        { value: 'sepia', label: 'Sepia' },
        { value: 'dark', label: 'Dark' }
    ];
</script>

<div class="settings-panel" role="dialog" aria-label="Reader settings">
    <div class="settings-header">
        <span class="settings-title">Reader settings</span>
        <button
            type="button"
            class="settings-close"
            onclick={onclose}
            aria-label="Close settings"
        >
            ×
        </button>
    </div>

    <div class="settings-row">
        <label for="sp-fontSize" class="settings-label">Font size</label>
        <input
            id="sp-fontSize"
            type="range"
            min="14"
            max="36"
            step="1"
            bind:value={$settings.fontSize}
        />
        <span class="settings-value tabular-nums">{$settings.fontSize}px</span>
    </div>

    <div class="settings-row">
        <span class="settings-label">Theme</span>
        <div class="settings-segmented">
            {#each THEMES as t (t.value)}
                <button
                    type="button"
                    class:active={$settings.theme === t.value}
                    onclick={() => ($settings.theme = t.value)}
                >
                    {t.label}
                </button>
            {/each}
        </div>
    </div>

    <div class="settings-row">
        <label class="toggle-label">
            <input type="checkbox" bind:checked={$settings.showIllustrations} />
            Show illustrations
        </label>
    </div>

    <div class="settings-row">
        <label class="toggle-label">
            <input type="checkbox" bind:checked={$settings.showVideos} />
            Show videos
        </label>
    </div>
</div>
