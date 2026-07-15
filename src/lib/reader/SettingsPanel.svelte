<script lang="ts">
    import { settings, type Theme } from './settings';
    import { t } from '../bw/ui-locales';
    import { uiLangForRegion } from '../data/region-config';
    import { $activeRegion as activeRegionStore } from '../../stores/region-store';

    let { onclose }: { onclose: () => void } = $props();

    const uiLang = uiLangForRegion(activeRegionStore.get());
    const tr = (k: string) => t(uiLang, 'reader.' + k);

    const THEMES: Array<{ value: Theme; label: string }> = [
        { value: 'Normal', label: 'Normal' },
        { value: 'Sepia', label: 'Sepia' },
        { value: 'Dark', label: 'Dark' }
    ];
</script>

<div class="settings-panel" role="dialog" aria-label="Reader settings">
    <div class="settings-header">
        <span class="settings-title">{tr('settings')}</span>
        <button
            type="button"
            class="settings-close"
            onclick={onclose}
            aria-label={tr('closeSettings')}
        >
            ×
        </button>
    </div>

    <div class="settings-row">
        <label for="sp-fontSize" class="settings-label">{tr('fontSize')}</label>
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
        <label for="sp-lineHeight" class="settings-label">{tr('lineHeight')}</label>
        <input
            id="sp-lineHeight"
            type="range"
            min="1.2"
            max="2.2"
            step="0.1"
            bind:value={$settings.lineHeight}
        />
        <span class="settings-value tabular-nums">{$settings.lineHeight.toFixed(1)}</span>
    </div>

    <div class="settings-row">
        <span class="settings-label">{tr('theme')}</span>
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
            {tr('showIllustrations')}
        </label>
    </div>

    <div class="settings-row">
        <label class="toggle-label">
            <input type="checkbox" bind:checked={$settings.showVideos} />
            {tr('showVideos')}
        </label>
    </div>
</div>
