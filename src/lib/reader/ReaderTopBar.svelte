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
        onSettings
    }: Props = $props();
</script>

<header class="reader-topbar">
    <div class="reader-topbar-bar">
        <div class="reader-topbar-start" aria-hidden="true">
            <!-- intentionally empty: no hamburger / drawer button -->
        </div>

        <div class="reader-topbar-center" title={title}>
            <span class="reader-topbar-title">{title}</span>
        </div>

        <div class="reader-topbar-end">
            <a
                class="tb-icon"
                href={`/${iso}/search`}
                aria-label="AI search"
                title="AI search"
            >
                💬
            </a>
            <button
                type="button"
                class="tb-icon"
                class:active={searchActive}
                onclick={onSearchToggle}
                aria-label="Search in chapter"
                title="Search in chapter"
            >
                🔍
            </button>
            <button
                type="button"
                class="tb-icon"
                class:flash={shareFlashing}
                onclick={onShare}
                aria-label="Share link"
                title={shareFlashing ? 'Link copied' : 'Share link'}
            >
                ⇪
            </button>
            <button
                type="button"
                class="tb-icon"
                class:active={audioInline}
                disabled={!hasAudio}
                onclick={onAudioToggle}
                aria-label={audioInline ? 'Hide audio player' : 'Show audio player'}
                title={hasAudio
                    ? audioInline
                        ? 'Hide audio player'
                        : 'Show audio player'
                    : 'No audio for this chapter'}
            >
                ♪
            </button>
            <button
                type="button"
                class="tb-icon tb-font-dec"
                onclick={() => onFontSize(-1)}
                aria-label="Smaller text"
                title="Smaller text"
            >
                A
            </button>
            <button
                type="button"
                class="tb-icon tb-font-inc"
                onclick={() => onFontSize(1)}
                aria-label="Larger text"
                title="Larger text"
            >
                A
            </button>
            <button
                type="button"
                class="tb-icon"
                class:active={bookmarked}
                onclick={onBookmarkToggle}
                aria-label={bookmarked ? 'Remove bookmark' : 'Bookmark this chapter'}
                title={bookmarked ? 'Remove bookmark' : 'Bookmark this chapter'}
            >
                {bookmarked ? '★' : '☆'}
            </button>
            <button
                type="button"
                class="tb-icon"
                onclick={onSettings}
                aria-label="Reader settings"
                title="Reader settings"
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
                placeholder="Find in this chapter…"
                bind:value={searchQuery}
                oninput={() => onSearchInput(searchQuery)}
                autofocus
            />
            <button type="button" class="tb-icon" onclick={onSearchToggle} aria-label="Close search">×</button>
        </div>
    {/if}
</header>
