<script lang="ts">
    /**
     * Look-alike of SE's top action bar, minus the left-drawer / hamburger
     * button (global navigation is intentionally deferred). Title in the
     * centre, icon buttons on the right: search, share, audio quick-toggle,
     * font size −/+, bookmark, settings. All buttons are delegated to
     * handlers owned by Reader.svelte.
     */
    type Props = {
        title: string;
        iso: string;
        searchActive: boolean;
        searchQuery: string;
        onSearchToggle: () => void;
        onSearchInput: (q: string) => void;
        onShare: () => void;
        shareFlashing: boolean;
        hasAudio: boolean;
        /** Whether the inline audio strip is currently visible within the
         *  Text view. ♪ button toggles this, not a mode switch. */
        audioInline: boolean;
        onAudioToggle: () => void;
        onFontSize: (delta: number) => void;
        bookmarked: boolean;
        onBookmarkToggle: () => void;
        onSettings: () => void;
        /** Open the book/chapter picker (tap the reference — SE/SAB pattern). */
        onTitle?: (anchorRect: DOMRect) => void;
    };
    let {
        title,
        iso,
        searchActive,
        searchQuery = $bindable(),
        onSearchToggle,
        onSearchInput,
        onShare,
        shareFlashing,
        hasAudio,
        audioInline,
        onAudioToggle,
        onFontSize,
        bookmarked,
        onBookmarkToggle,
        onSettings,
        onTitle
    }: Props = $props();

    import { t } from '../bw/ui-locales';
    import { uiLangForRegion } from '../data/region-config';
    import { $activeRegion as activeRegionStore } from '../../stores/region-store';
    const uiLang = uiLangForRegion(activeRegionStore.get());
    const tr = (k: string) => t(uiLang, 'reader.' + k);
</script>

<header class="reader-topbar">
    <div class="reader-topbar-bar">
        <div class="reader-topbar-start" aria-hidden="true">
            <!-- intentionally empty: no hamburger / drawer button -->
        </div>

        <div class="reader-topbar-center" title={title}>
            {#if onTitle}
                <button
                    type="button"
                    class="reader-topbar-title reader-topbar-title-btn"
                    onclick={(e) => onTitle?.(e.currentTarget.getBoundingClientRect())}
                >
                    {title} <span class="reader-topbar-title-caret" aria-hidden="true">▾</span>
                </button>
            {:else}
                <span class="reader-topbar-title">{title}</span>
            {/if}
        </div>

        <div class="reader-topbar-end">
            <a
                class="tb-icon"
                href={`/${iso}/search`}
                aria-label={tr('searchAria')}
                title={tr('searchAria')}
            >
                💬
            </a>
            <button
                type="button"
                class="tb-icon"
                class:active={searchActive}
                onclick={onSearchToggle}
                aria-label={tr('searchInChapter')}
                title={tr('searchInChapter')}
            >
                🔍
            </button>
            <button
                type="button"
                class="tb-icon"
                class:flash={shareFlashing}
                onclick={onShare}
                aria-label={tr('shareLink')}
                title={shareFlashing ? tr('linkCopied') : tr('shareLink')}
            >
                ⇪
            </button>
            <button
                type="button"
                class="tb-icon"
                class:active={audioInline}
                disabled={!hasAudio}
                onclick={onAudioToggle}
                aria-label={audioInline ? tr('hideAudio') : tr('showAudio')}
                title={hasAudio
                    ? audioInline
                        ? tr('hideAudio')
                        : tr('showAudio')
                    : tr('noAudioChapter')}
            >
                ♪
            </button>
            <button
                type="button"
                class="tb-icon tb-font-dec"
                onclick={() => onFontSize(-1)}
                aria-label={tr('smallerText')}
                title={tr('smallerText')}
            >
                A
            </button>
            <button
                type="button"
                class="tb-icon tb-font-inc"
                onclick={() => onFontSize(1)}
                aria-label={tr('largerText')}
                title={tr('largerText')}
            >
                A
            </button>
            <button
                type="button"
                class="tb-icon"
                class:active={bookmarked}
                onclick={onBookmarkToggle}
                aria-label={bookmarked ? tr('removeBookmark') : tr('bookmark')}
                title={bookmarked ? tr('removeBookmark') : tr('bookmark')}
            >
                {bookmarked ? '★' : '☆'}
            </button>
            <button
                type="button"
                class="tb-icon"
                onclick={onSettings}
                aria-label={tr('settings')}
                title={tr('settings')}
            >
                ⚙
            </button>
        </div>
    </div>

    {#if searchActive}
        <div class="reader-topbar-search">
            <!-- svelte-ignore a11y_autofocus -->
            <input
                type="search"
                placeholder={tr('findInChapter')}
                bind:value={searchQuery}
                oninput={() => onSearchInput(searchQuery)}
                autofocus
            />
            <button type="button" class="tb-icon" onclick={onSearchToggle} aria-label={tr('closeSearch')}>×</button>
        </div>
    {/if}
</header>
