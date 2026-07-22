<script lang="ts">
    /**
     * Look-alike of SE's top action bar, trimmed to just navigation: a
     * left-drawer hamburger, then separate Book / Chapter dropdown triggers
     * (sab-pwa's Navbar + BookSelector/ChapterSelector pattern — each opens
     * BiblePickerSheet landed on its own tab).
     *
     * Every icon this bar used to carry (search, in-chapter find, share,
     * audio, font size, bookmark, settings) has moved: the ones reachable
     * elsewhere (AI search, font size, settings) were removed outright since
     * they duplicated StandardBottomBar/StandardSidebar/SettingsPanel;
     * in-chapter find was dropped (AI search already covers it); share and
     * bookmark moved to the left-nav sidebars; audio moved to
     * StandardBottomBar's own tab. See Reader.svelte's `toggle-bookmark` /
     * `toggle-inline-audio` window-event listeners for the new trigger path.
     */
    type Props = {
        bookLabel: string;
        chapterLabel: string;
        /** Open the book/chapter picker, landing on the Book/Chapter tab
         *  respectively (sab-pwa's BookSelector/ChapterSelector pattern). */
        onBookTap?: (anchorRect: DOMRect) => void;
        onChapterTap?: (anchorRect: DOMRect) => void;
        /** Toggle the left navigation drawer. */
        onMenu?: () => void;
        /** Toggle the two-language parallel/interlinear view. */
        onParallelView?: () => void;
        parallelViewActive?: boolean;
    };
    let {
        bookLabel,
        chapterLabel,
        onBookTap,
        onChapterTap,
        onMenu,
        onParallelView,
        parallelViewActive = false
    }: Props = $props();

    import { t } from '../bw/ui-locales';
    import { uiLangForRegion } from '../data/region-config';
    import { $activeRegion as activeRegionStore } from '../../stores/region-store';
    const uiLang = uiLangForRegion(activeRegionStore.get());
</script>

<header class="reader-topbar">
    <div class="reader-topbar-bar">
        <div class="reader-topbar-start">
            <button
                type="button"
                class="tb-icon reader-topbar-menu-btn"
                onclick={onMenu}
                aria-label={t(uiLang, 'nav.toggleMenu')}
                title={t(uiLang, 'nav.toggleMenu')}
            >
                ☰
            </button>
            <button
                type="button"
                class="reader-topbar-select reader-topbar-select-book"
                onclick={(e) => onBookTap?.(e.currentTarget.getBoundingClientRect())}
                title={bookLabel}
            >
                <span class="reader-topbar-select-label">{bookLabel}</span>
                <span class="reader-topbar-title-caret" aria-hidden="true">▾</span>
            </button>
            <button
                type="button"
                class="reader-topbar-select reader-topbar-select-chapter"
                onclick={(e) => onChapterTap?.(e.currentTarget.getBoundingClientRect())}
                title={chapterLabel}
            >
                <span class="reader-topbar-select-label">{chapterLabel}</span>
                <span class="reader-topbar-title-caret" aria-hidden="true">▾</span>
            </button>
        </div>

        <div class="reader-topbar-center"></div>

        <div class="reader-topbar-end">
            <button
                type="button"
                class="tb-icon reader-topbar-parallel-btn"
                class:active={parallelViewActive}
                onclick={onParallelView}
                aria-label={t(uiLang, 'nav.parallelView')}
                aria-pressed={parallelViewActive}
                title={t(uiLang, 'nav.parallelView')}
            >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <rect x="3" y="4" width="8" height="16" rx="1.5" />
                    <rect x="13" y="4" width="8" height="16" rx="1.5" />
                </svg>
            </button>
        </div>
    </div>
</header>
