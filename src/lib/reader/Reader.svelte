<script lang="ts">
    import { onMount, onDestroy, tick } from 'svelte';
    const browser = typeof window !== "undefined";
    import {
        useSwipe,
        usePinch,
        type SwipeCustomEvent,
        type PinchCustomEvent
    } from 'svelte-gestures';
    import { fetchCatalog, chapterCount, type Catalog, type CatalogDoc } from './catalog';
    import { loadDocSet, isLoaded } from './store';
    import { fetchSofria, renderSofria, type RenderedChapter, type CaptionMode } from './sofria';
    import { fetchAndRenderBSB } from './bsbRender';
    import type { MediaManifest, VideoEntry, AudioEntry } from '../data/pkfInfo';
    import { settings } from './settings';
    import SettingsPanel from './SettingsPanel.svelte';
    import AudioPlayer from './AudioPlayer.svelte';
    import ReaderTopBar from './ReaderTopBar.svelte';
    import { getProskomma } from './store';
    import { loadGlossary, lookup as lookupGlossary, type Glossary } from './glossary';
    import { saveLastPosition, loadLastPosition, saveLastIso } from './position';
    import StoriesGrid from '../components/StoriesGrid.svelte';
    import { $bibleHighlights as bibleHighlightsStore } from '../../stores/bible-highlight-store';
    import './reader.css';

    type Props = {
        iso: string;          // e.g. "zai"
        docSetId: string;     // e.g. "zai_zai"
        pkfUrl: string;       // e.g. "/pkf/zai/zai_zai.0HgVnSWZ.pkf"
        catalogUrl: string;   // e.g. "/pkf/zai/zai_zai.C3ggCijo.json"
        styleUrl?: string | null;                      // e.g. "/pkf/zai/styles/delta.css"
        figureUrls?: Record<string, string>;           // filename -> hosted URL
        captionMode?: CaptionMode;                     // from config/figure_captions.json
        media?: MediaManifest;                         // per-iso video + audio manifest
        bsbMode?: boolean;                             // true for Berean Standard Bible
    };
    let {
        iso,
        docSetId,
        pkfUrl,
        catalogUrl,
        styleUrl,
        figureUrls = {},
        captionMode = 'hide',
        media,
        bsbMode = false
    }: Props = $props();

    let catalog = $state<Catalog | null>(null);
    let loadError = $state<string | null>(null);

    let currentBook = $state<CatalogDoc | null>(null);
    let currentChapter = $state<number>(1);
    let rendered = $state<RenderedChapter | null>(null);
    let rendering = $state(false);
    let renderError = $state<string | null>(null);
    let pkfLoaded = $state(false);

    const LINK_ID = 'bw-lang-css';
    let linkEl: HTMLLinkElement | null = null;

    onMount(async () => {
        saveLastIso(iso);
        if (styleUrl) {
            // Swap in this language's CSS bundle. Any previously-injected link with
            // the same id gets removed first so only one language's styles are live.
            const existing = document.getElementById(LINK_ID);
            if (existing) existing.remove();
            linkEl = document.createElement('link');
            linkEl.rel = 'stylesheet';
            linkEl.href = styleUrl;
            linkEl.id = LINK_ID;
            linkEl.dataset.iso = iso;
            document.head.appendChild(linkEl);
        }
        document.addEventListener('click', onGlobalClick);
        document.addEventListener('keydown', onGlobalKey);
        loadBookmarks();
        try {
            catalog = await fetchCatalog(catalogUrl);
        } catch (e) {
            loadError = e instanceof Error ? e.message : String(e);
            return;
        }
        // Initial view is the picker (Stories + Books grids) — no auto-open.
        // The "global last-position memory" still drives in-chapter navigation
        // and prev/next, but the user always lands on the picker first so they
        // can choose a story or a book chapter.

        // Eagerly load the PKF binary in the background so the first chapter
        // open is instant instead of waiting for fetch + parse.
        if (!bsbMode) ensurePkf();

        // Sidebar navigation: open a specific book+chapter on demand
        window.addEventListener('navigate-to-chapter', ((e: CustomEvent) => {
            const { book, chapter, highlightVerses } = e.detail;
            const doc = catalog?.documents.find((d) => d.bookCode === book);
            if (doc) {
                openBookChapter(doc, chapter).then(() => {
                    if (highlightVerses?.length) highlightVersesInDom(highlightVerses);
                });
            }
        }) as EventListener);

        // If arriving with Bible highlights from search, apply them after chapter opens
        const hlMap = bibleHighlightsStore.get();
        if (hlMap.size > 0) {
            const pos = loadLastPosition();
            const verses = hlMap.get(`${pos.book}:${pos.chapter}`) ?? [];
            const doc = catalog?.documents.find((d) => d.bookCode === pos.book);
            if (doc && verses.length) {
                openBookChapter(doc, pos.chapter).then(() => highlightVersesInDom(verses));
            }
        }
    });

    onDestroy(() => {
        if (!browser) return;
        if (linkEl && linkEl.parentNode) linkEl.parentNode.removeChild(linkEl);
        linkEl = null;
        document.removeEventListener('click', onGlobalClick);
        document.removeEventListener('keydown', onGlobalKey);
    });

    async function ensurePkf() {
        if (pkfLoaded || isLoaded(docSetId)) {
            pkfLoaded = true;
            return;
        }
        await loadDocSet(docSetId, pkfUrl);
        pkfLoaded = true;
    }

    async function openBookChapter(book: CatalogDoc, ch: number) {
        // Remember where the user was in the chapter they're leaving.
        saveScroll();
        currentBook = book;
        currentChapter = ch;
        rendered = null;
        renderError = null;
        popover = null;
        rendering = true;
        // Persist globally so switching languages resumes at the same reference.
        saveLastPosition({ book: book.bookCode, chapter: ch });
        window.dispatchEvent(new CustomEvent('bible-position-changed', { detail: { book: book.bookCode, chapter: ch } }));
        try {
            if (bsbMode) {
                rendered = await fetchAndRenderBSB(book.bookCode, ch);
            } else {
                await ensurePkf();
                const sofria = fetchSofria(docSetId, book.bookCode, ch);
                const inlineForRender = $settings.showVideos
                    ? (media?.videos.filter(
                          (v) =>
                              v.placement?.bookCode === book.bookCode &&
                              v.placement?.chapter === ch &&
                              v.placement?.verse != null
                      ) ?? [])
                    : [];
                const figsForRender = $settings.showIllustrations ? figureUrls : {};
                rendered = renderSofria(sofria, figsForRender, captionMode, inlineForRender);
            }
        } catch (e) {
            renderError = e instanceof Error ? e.message : String(e);
        } finally {
            rendering = false;
        }
        // After the new chapter is in the DOM, restore prior scroll for this
        // reference (or jump to top for first visit).
        await tick();
        const restored = scrollByChapter.get(chapterKey(book.bookCode, ch));
        if (browser) window.scrollTo(0, restored ?? 0);
    }

    function highlightVersesInDom(verses: number[]) {
        // Clear any previous search highlights
        document.querySelectorAll('.verse-block.search-highlight').forEach((el) =>
            el.classList.remove('search-highlight'));
        if (!verses.length) return;
        requestAnimationFrame(() => {
            let firstEl: Element | null = null;
            for (const v of verses) {
                const el = document.querySelector(`.verse-block[data-v="${v}"]`);
                if (el) {
                    el.classList.add('search-highlight');
                    if (!firstEl) firstEl = el;
                }
            }
            if (firstEl) firstEl.scrollIntoView({ block: 'center', behavior: 'smooth' });
        });
    }

    function closeReader() {
        currentBook = null;
        rendered = null;
        renderError = null;
    }

    let chapterList = $derived(
        currentBook ? Array.from({ length: chapterCount(currentBook) }, (_, i) => i + 1) : []
    );

    /** Format-mode tabs (Tier 2): Text is the default; Audio / Video appear
     *  only when the current chapter actually has audio / video entries. */
    type ReaderMode = 'text' | 'audio' | 'video';
    let mode = $state<ReaderMode>('text');
    function setMode(m: ReaderMode) {
        mode = m;
    }
    // Fall back to Text when the current chapter doesn't have the active
    // mode's media, or when settings hide the corresponding format.
    $effect(() => {
        if (mode === 'audio' && audioForChapter.length === 0) mode = 'text';
        if (mode === 'video' && (videosForChapter.length === 0 || !$settings.showVideos))
            mode = 'text';
    });
    function prevChapter() {
        if (!currentBook || currentChapter <= 1) return;
        openBookChapter(currentBook, currentChapter - 1);
    }
    function nextChapter() {
        if (!currentBook || currentChapter >= chapterList.length) return;
        openBookChapter(currentBook, currentChapter + 1);
    }

    /* ---- swipe + pinch on the chapter body --------------------------------
     * Swipe left / right → next / prev chapter.
     * Pinch in / out     → bump font size by ±1.
     */
    function doSwipe(e: SwipeCustomEvent) {
        const dir = e.detail.direction;
        if (dir === 'left') nextChapter();
        else if (dir === 'right') prevChapter();
    }
    let lastPinch = 1;
    function doPinch(e: PinchCustomEvent) {
        const scale = e.detail.scale;
        if (Math.abs(scale - lastPinch) > 0.1) {
            adjustFontSize(scale > lastPinch ? 1 : -1);
            lastPinch = scale;
        }
    }

    /* ---- saved scroll position per book/chapter --------------------------- */
    const scrollByChapter = new Map<string, number>();
    const chapterKey = (b: string, ch: number) => `${b}|${ch}`;
    function saveScroll() {
        if (!browser || !currentBook) return;
        scrollByChapter.set(chapterKey(currentBook.bookCode, currentChapter), window.scrollY);
    }

    /** Footnote / xref / glossary popover. Rendered as a bottom-pinned stack
     *  card so it's always reachable on mobile and never obscures the verse
     *  the user just tapped (the SE/SAB pattern). */
    type Popover =
        | { kind: 'note' | 'xref'; idx: number }
        | { kind: 'glossary'; term: string; definition: string };
    let popover = $state<Popover | null>(null);
    let popoverEl: HTMLDivElement | null = $state(null);

    function openPopover(kind: 'note' | 'xref', idx: number, _anchor: HTMLElement) {
        popover = { kind, idx };
    }
    function openGlossaryPopover(term: string, _anchor: HTMLElement) {
        if (!glossaryLoaded) loadGlossaryOnce();
        const entry = lookupGlossary(glossary, term);
        if (!entry) return; // silent if no glossary entry
        popover = { kind: 'glossary', term: entry.term, definition: entry.definition };
    }
    function closePopover() {
        popover = null;
    }

    /** Glossary map — lazy-loaded on first glossary-term click. */
    let glossary = $state<Glossary | null>(null);
    let glossaryLoaded = $state(false);
    function loadGlossaryOnce() {
        if (glossaryLoaded) return;
        glossaryLoaded = true;
        // Needs the pkf to be thawed first; assume caller runs after ensurePkf().
        if (!isLoaded(docSetId)) return;
        glossary = loadGlossary(getProskomma(), docSetId);
    }

    /** Settings drawer visibility toggle. */
    let showSettings = $state(false);

    // ---- top-bar search (in-chapter find) ----------------------------------
    let searchActive = $state(false);
    let searchQuery = $state('');
    function toggleSearch() {
        searchActive = !searchActive;
        if (!searchActive) searchQuery = '';
    }
    function onSearchInput(q: string) {
        searchQuery = q;
    }
    /** Wrap every occurrence of query in <mark class="search-hit"> in text
     *  segments (between HTML tags) only, without touching attribute values
     *  or tag names. Keeps the existing HTML structure intact. */
    function addHighlights(html: string, q: string): string {
        const query = q.trim();
        if (!query) return html;
        const esc = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const re = new RegExp(esc, 'gi');
        return html.replace(/>([^<]+)</g, (_m, text: string) => {
            return `>${text.replace(re, (m) => `<mark class="search-hit">${m}</mark>`)}<`;
        });
    }
    let displayHtml = $derived(
        rendered ? addHighlights(rendered.html, searchActive ? searchQuery : '') : ''
    );

    // ---- top-bar share (copy URL) ------------------------------------------
    let shareFlashing = $state(false);
    async function copyShareLink() {
        if (!browser) return;
        const url = window.location.href;
        try {
            if (navigator.share) {
                await navigator.share({ title: document.title, url });
            } else {
                await navigator.clipboard.writeText(url);
            }
        } catch {
            /* user cancelled or clipboard disallowed — silent */
        }
        shareFlashing = true;
        setTimeout(() => (shareFlashing = false), 1400);
    }

    // ---- top-bar audio toggle ----------------------------------------------
    // Clicking ♪ toggles an inline audio bar within the Text view (matches
    // SE: the icon does not leave the text — it overlays an audio player
    // above the scripture). Independent from the Audio format tab, which
    // still gives a dedicated audio-only view.
    let audioInline = $state(false);
    function toggleInlineAudio() {
        if (audioForChapter.length === 0) return;
        audioInline = !audioInline;
    }

    // ---- top-bar font size A-/A+ -------------------------------------------
    const FONT_SIZE_MIN = 14;
    const FONT_SIZE_MAX = 36;
    function adjustFontSize(delta: number) {
        settings.update((s) => ({
            ...s,
            fontSize: Math.max(FONT_SIZE_MIN, Math.min(FONT_SIZE_MAX, s.fontSize + delta))
        }));
    }

    // ---- top-bar bookmark toggle -------------------------------------------
    const BOOKMARKS_KEY = 'bw-bookmarks';
    let bookmarks = $state<Set<string>>(new Set());
    function loadBookmarks() {
        if (!browser) return;
        try {
            const raw = localStorage.getItem(BOOKMARKS_KEY);
            if (raw) bookmarks = new Set(JSON.parse(raw));
        } catch {
            /* ignore */
        }
    }
    function saveBookmarks() {
        if (!browser) return;
        try {
            localStorage.setItem(BOOKMARKS_KEY, JSON.stringify([...bookmarks]));
        } catch {
            /* ignore */
        }
    }
    function bookmarkKey(): string {
        return currentBook ? `${iso}/${currentBook.bookCode}/${currentChapter}` : '';
    }
    let bookmarked = $derived(bookmarkKey() !== '' && bookmarks.has(bookmarkKey()));
    function toggleBookmark() {
        const k = bookmarkKey();
        if (!k) return;
        const next = new Set(bookmarks);
        if (next.has(k)) next.delete(k);
        else next.add(k);
        bookmarks = next;
        saveBookmarks();
    }

    // ---- top-bar title -----------------------------------------------------
    let topBarTitle = $derived(
        currentBook
            ? `${currentBook.toc2 ?? currentBook.toc ?? currentBook.bookCode} ${currentChapter}`
            : iso
    );
    function onGlobalClick(e: MouseEvent) {
        if (!popover) return;
        const target = e.target as Node | null;
        if (popoverEl && target && popoverEl.contains(target)) return;
        // Ignore clicks on callers — their own handler manages the popover state.
        if (target instanceof HTMLElement && target.closest('.note-caller, .xref-caller')) return;
        closePopover();
    }
    function onGlobalKey(e: KeyboardEvent) {
        if (e.key === 'Escape' && popover) closePopover();
    }

    /** Audio entries attached to the current book+chapter. */
    let audioForChapter = $derived<AudioEntry[]>(
        currentBook && media
            ? media.audio.items.filter(
                  (a) =>
                      a.url != null &&
                      a.bookCode === currentBook!.bookCode &&
                      a.chapter === currentChapter
              )
            : []
    );
    /** Videos attached to the current book+chapter. Split by whether they
     * have a verse-level placement: ones with a verse go inline in the
     * scripture text (emitted by the Sofria renderer), the rest go in the
     * top strip above the chapter body. */
    let videosForChapter = $derived<VideoEntry[]>(
        currentBook && media
            ? media.videos.filter(
                  (v) =>
                      v.placement?.bookCode === currentBook!.bookCode &&
                      v.placement?.chapter === currentChapter
              )
            : []
    );
    let inlineVideos = $derived<VideoEntry[]>(
        videosForChapter.filter((v) => v.placement?.verse != null)
    );
    let topVideos = $derived<VideoEntry[]>(
        videosForChapter.filter((v) => v.placement?.verse == null)
    );

    /** Which top-strip video thumbnail has been clicked open; keyed by video.id.
     * Inline videos (inside {@html}) are handled via imperative DOM replacement
     * on click so the player element survives re-renders of neighbouring state. */
    let openedVideos = $state<Set<string>>(new Set());
    function openVideo(v: VideoEntry) {
        openedVideos = new Set([...openedVideos, v.id]);
    }

    /** Attach an HLS .m3u8 stream to a <video> element. Safari plays HLS
     *  natively; everywhere else dynamically imports hls.js on first use so
     *  it stays out of the initial bundle. */
    async function attachHls(videoEl: HTMLVideoElement, url: string) {
        if (videoEl.canPlayType('application/vnd.apple.mpegurl')) {
            videoEl.src = url;
            videoEl.play().catch(() => {});
            return;
        }
        try {
            const mod = await import('hls.js');
            const Hls = (mod as { default: typeof import('hls.js').default }).default;
            if (Hls.isSupported()) {
                const hls = new Hls();
                hls.loadSource(url);
                hls.attachMedia(videoEl);
                hls.on(Hls.Events.MANIFEST_PARSED, () => videoEl.play().catch(() => {}));
                (videoEl as HTMLVideoElement & { _hls?: unknown })._hls = hls;
            } else {
                videoEl.src = url;
            }
        } catch {
            videoEl.src = url;
        }
    }

    /** Build a DOM player element for a video entry. Used both for reactive
     *  top-strip rendering and for imperative in-text replacement. */
    function buildPlayerElement(v: VideoEntry): HTMLElement {
        const wrap = document.createElement('div');
        wrap.className = 'reader-video-player reader-inline-video-player';
        if (v.kind === 'hls') {
            const video = document.createElement('video');
            video.controls = true;
            video.autoplay = true;
            video.setAttribute('playsinline', '');
            wrap.appendChild(video);
            attachHls(video, v.onlineUrl);
        } else if (v.kind === 'file') {
            const video = document.createElement('video');
            video.controls = true;
            video.autoplay = true;
            video.src = v.onlineUrl;
            wrap.appendChild(video);
        } else {
            const iframe = document.createElement('iframe');
            iframe.src = v.onlineUrl;
            iframe.title = v.title || 'video';
            iframe.width = String(v.width ?? 640);
            iframe.height = String(v.height ?? 360);
            iframe.frameBorder = '0';
            iframe.allow = 'autoplay; encrypted-media; picture-in-picture';
            iframe.setAttribute('allowfullscreen', '');
            wrap.appendChild(iframe);
        }
        if (v.title) {
            const title = document.createElement('div');
            title.className = 'reader-video-title';
            title.textContent = v.title;
            wrap.appendChild(title);
        }
        return wrap;
    }

    /** Svelte action that mounts a video player element (iframe for YouTube
     *  /ArcLight/etc., <video> for HLS and direct files) inside the node it's
     *  applied to. Used by the top-strip reactive rendering path. */
    function mountPlayer(node: HTMLElement, v: VideoEntry) {
        const player = buildPlayerElement(v);
        node.appendChild(player);
        return {
            destroy() {
                const hls = (player.querySelector('video') as (HTMLVideoElement & { _hls?: { destroy: () => void } }) | null)?._hls;
                if (hls) hls.destroy();
                node.replaceChildren();
            }
        };
    }

    /** Click / keydown delegation for the rendered scripture body. Handles:
     *   - inline video thumbnails → replace in place with a real player
     *   - footnote callers        → open popover
     *   - cross-ref callers       → open popover
     *   - verse-block taps        → toggle verse selection (visual highlight)
     */
    function handleBodyClick(e: MouseEvent | KeyboardEvent) {
        const target = e.target as HTMLElement | null;
        if (!target) return;
        const isKey = e.type === 'keydown';
        if (
            isKey &&
            (e as KeyboardEvent).key !== 'Enter' &&
            (e as KeyboardEvent).key !== ' '
        )
            return;

        // Inline video thumbnail
        const thumb = target.closest<HTMLElement>('.reader-inline-video[data-video-id]');
        if (thumb) {
            e.preventDefault();
            const id = thumb.getAttribute('data-video-id');
            if (!id) return;
            const v = inlineVideos.find((x) => x.id === id);
            if (!v) return;
            thumb.replaceWith(buildPlayerElement(v));
            return;
        }

        // Footnote caller
        const noteBtn = target.closest<HTMLElement>('.note-caller[data-note-idx]');
        if (noteBtn) {
            e.preventDefault();
            const idx = parseInt(noteBtn.getAttribute('data-note-idx') ?? '', 10);
            if (Number.isFinite(idx)) openPopover('note', idx, noteBtn);
            return;
        }

        // Cross-ref caller
        const xrefBtn = target.closest<HTMLElement>('.xref-caller[data-xref-idx]');
        if (xrefBtn) {
            e.preventDefault();
            const idx = parseInt(xrefBtn.getAttribute('data-xref-idx') ?? '', 10);
            if (Number.isFinite(idx)) openPopover('xref', idx, xrefBtn);
            return;
        }

        // Glossary term (\w or \k) — lazy-build the glossary map on first use.
        const termBtn = target.closest<HTMLElement>('.glossary-term[data-term]');
        if (termBtn) {
            e.preventDefault();
            const term = termBtn.getAttribute('data-term') ?? '';
            if (term) openGlossaryPopover(term, termBtn);
            return;
        }

        // Verse-block tap → toggle .selected. Imperative DOM toggle so opened
        // inline video players are not disturbed by re-renders.
        const verse = target.closest<HTMLElement>('.verse-block[data-v]');
        if (verse) {
            verse.classList.toggle('selected');
        }
    }
</script>

{#if loadError}
    <div class="alert alert-error text-sm">Failed to load catalog: {loadError}</div>
{:else if !catalog}
    <div class="text-sm text-base-content/60">Loading catalog…</div>
{:else if !currentBook}
    <div class="flex justify-end mb-2">
        <a
            href={`/${iso}/search`}
            class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-semibold"
            style="color:rgb(0,11,99);background:rgba(0,11,99,0.06)"
        >
            💬 <span>AI Search</span>
        </a>
    </div>
    <StoriesGrid {iso} />
    <section>
        <h2 class="text-sm font-semibold uppercase tracking-wide text-base-content/60 mb-2">
            Bible Books ({catalog.documents.length})
        </h2>
        <ul class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
            {#each catalog.documents as doc (doc.id)}
                {@const cc = chapterCount(doc)}
                <li>
                    <button
                        class="w-full text-left p-3 rounded border border-base-300 hover:border-primary hover:bg-base-200 transition-colors"
                        onclick={() => openBookChapter(doc, 1)}
                        disabled={cc === 0}
                    >
                        <div class="font-mono text-xs text-base-content/50">{doc.bookCode}</div>
                        <div class="text-sm truncate">
                            {doc.toc2 ?? doc.toc ?? doc.h ?? doc.bookCode}
                        </div>
                        <div class="text-xs text-base-content/60 mt-1">
                            {cc === 0 ? 'no chapters' : `${cc} ch.`}
                        </div>
                    </button>
                </li>
            {/each}
        </ul>
    </section>
{:else}
    <section>
        <ReaderTopBar
            title={topBarTitle}
            {iso}
            searchActive={searchActive}
            bind:searchQuery
            onSearchToggle={toggleSearch}
            onSearchInput={onSearchInput}
            onShare={copyShareLink}
            shareFlashing={shareFlashing}
            hasAudio={audioForChapter.length > 0}
            audioInline={audioInline}
            onAudioToggle={toggleInlineAudio}
            onFontSize={adjustFontSize}
            bookmarked={bookmarked}
            onBookmarkToggle={toggleBookmark}
            onSettings={() => (showSettings = !showSettings)}
        />

        <div class="flex items-center mb-3">
            <button class="btn btn-sm btn-ghost" onclick={closeReader}>← Books</button>
        </div>

        <!-- Floating side arrows: vertically centred on the viewport, hidden on
             narrow screens (mobile uses swipe). Mirror SAB's reading layout. -->
        <button
            type="button"
            class="reader-side-nav left"
            class:visible={currentChapter > 1}
            onclick={prevChapter}
            aria-label="Previous chapter"
        >
            ‹
        </button>
        <button
            type="button"
            class="reader-side-nav right"
            class:visible={currentChapter < chapterList.length}
            onclick={nextChapter}
            aria-label="Next chapter"
        >
            ›
        </button>

        {#if showSettings}
            <SettingsPanel onclose={() => (showSettings = false)} />
        {/if}

        <div class="flex flex-wrap gap-1 mb-4">
            {#each chapterList as ch (ch)}
                <button
                    class="btn btn-xs {ch === currentChapter ? 'btn-primary' : 'btn-ghost'}"
                    onclick={() => openBookChapter(currentBook!, ch)}
                >
                    {ch}
                </button>
            {/each}
        </div>

        {#if audioForChapter.length > 0 || ($settings.showVideos && videosForChapter.length > 0)}
            <div class="reader-format-tabs">
                <button
                    type="button"
                    class:active={mode === 'text'}
                    onclick={() => setMode('text')}
                >
                    Text
                </button>
                {#if audioForChapter.length > 0}
                    <button
                        type="button"
                        class:active={mode === 'audio'}
                        onclick={() => setMode('audio')}
                    >
                        Audio
                    </button>
                {/if}
                {#if $settings.showVideos && videosForChapter.length > 0}
                    <button
                        type="button"
                        class:active={mode === 'video'}
                        onclick={() => setMode('video')}
                    >
                        Video
                    </button>
                {/if}
            </div>
        {/if}

        <div
            class="reader-root"
            data-iso={iso}
            data-theme={$settings.theme}
            style={`font-size:${$settings.fontSize}px`}
        >
            {#if mode === 'audio' && audioForChapter.length > 0}
                <div class="reader-media">
                    {#each audioForChapter as a (a.filename)}
                        {#if a.url}
                            <AudioPlayer
                                src={a.url}
                                label={`${a.bookCode ?? ''} ${a.chapter ?? ''}`.trim()}
                            />
                        {/if}
                    {/each}
                </div>
            {:else if mode === 'video' && videosForChapter.length > 0 && $settings.showVideos}
                <div class="reader-media">
                    <div class="reader-videos">
                        {#each videosForChapter as v (v.id)}
                            {#if openedVideos.has(v.id)}
                                <div
                                    class="reader-video-player"
                                    use:mountPlayer={v}
                                ></div>
                            {:else}
                                <button
                                    class="reader-video-thumb"
                                    type="button"
                                    onclick={() => openVideo(v)}
                                    aria-label={`Play ${v.title}`}
                                    style={v.thumbnailUrl
                                        ? `background-image:url(${v.thumbnailUrl})`
                                        : ''}
                                >
                                    <span class="reader-video-play" aria-hidden="true">▶</span>
                                    <span class="reader-video-kind">{v.kind}</span>
                                    <span class="reader-video-title">{v.title}</span>
                                </button>
                            {/if}
                        {/each}
                    </div>
                </div>
            {/if}

            {#if mode === 'text'}
                <!-- svelte-ignore a11y_click_events_have_key_events -->
                <!-- svelte-ignore a11y_no_static_element_interactions -->
                <div
                    class="reader-body"
                    class:has-bottom-bar={audioInline && audioForChapter.length > 0}
                    onclick={handleBodyClick}
                    onkeydown={handleBodyClick}
                    {...useSwipe(doSwipe, () => ({
                        timeframe: 300,
                        minSwipeDistance: 60,
                        touchAction: 'pan-y'
                    }))}
                    {...usePinch(doPinch)}
                >
                    {#if rendering}
                        <div class="text-sm text-base-content/60">Loading chapter…</div>
                    {:else if renderError}
                        <div class="alert alert-error text-sm">{renderError}</div>
                    {:else if rendered}
                        {@html displayHtml}
                    {:else}
                        <div class="text-sm text-base-content/60">No content rendered.</div>
                    {/if}
                </div>
            {/if}
        </div>

        <!-- Bottom-pinned inline audio bar (toggle via ♪ in the topbar). -->
        {#if mode === 'text' && audioInline && audioForChapter.length > 0}
            <div class="reader-audio-bottom">
                {#each audioForChapter as a (a.filename)}
                    {#if a.url}
                        <AudioPlayer
                            src={a.url}
                            label={`${a.bookCode ?? ''} ${a.chapter ?? ''}`.trim()}
                        />
                    {/if}
                {/each}
            </div>
        {/if}

        {#if popover}
            <div
                class="reader-note-popover"
                class:above-audio={audioInline && audioForChapter.length > 0}
                bind:this={popoverEl}
                role="dialog"
                aria-label={popover.kind === 'note'
                    ? 'Footnote'
                    : popover.kind === 'xref'
                      ? 'Cross-reference'
                      : 'Glossary'}
            >
                <button class="close" type="button" aria-label="Close" onclick={closePopover}>
                    ×
                </button>
                {#if popover.kind === 'glossary'}
                    <div class="popover-term">{popover.term}</div>
                    <div class="note-body">{popover.definition}</div>
                {:else if rendered}
                    {@const pool = popover.kind === 'note' ? rendered.footnotes : rendered.xrefs}
                    {@const entry = pool[popover.idx]}
                    {#if entry}
                        <div class="note-body">{@html entry.html}</div>
                    {/if}
                {/if}
            </div>
        {/if}
    </section>
{/if}
