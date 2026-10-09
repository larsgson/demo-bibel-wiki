<script lang="ts">
    import { onMount, onDestroy, tick } from 'svelte';
    const browser = typeof window !== "undefined";
    import {
        useSwipe,
        usePinch,
        type SwipeCustomEvent,
        type PinchCustomEvent
    } from 'svelte-gestures';
    import { chapterCount, type Catalog, type CatalogDoc } from './catalog';
    import { loadReaderCatalog } from './readerCatalog';
    import { loadDocSet, isLoaded } from './store';
    import { renderChapterHtml, injectPlacementVideos, verseLabelIncludes, type RenderResult } from '../sofria';
    import { pkfRenderOptions } from '../sofria/pkf';
    import { captionModeFor } from '../data/figureCaptions';
    import { loadChapterDoc } from '../bw/chapter-doc';
    import { resolveTextEditions } from '../bw/text-edition';
    import { sabSharedStyleUrl, type PkfAssets } from '../bw/pkf-info';
    import { nameFor } from '../data/languageNames';
    import type { MediaManifest, VideoEntry, AudioEntry } from '../data/pkfInfo';
    import { settings } from './settings';
    import SettingsPanel from './SettingsPanel.svelte';
    import AudioPlayer from './AudioPlayer.svelte';
    import ReaderTopBar from './ReaderTopBar.svelte';
    import { getProskomma } from './store';
    import { loadGlossary, lookup as lookupGlossary, type Glossary } from './glossary';
    import { saveLastPosition, loadLastPosition, hasLastPosition, resolvePosition, saveLastIso } from './position';
    import { $bibleHighlights as bibleHighlightsStore } from '../../stores/bible-highlight-store';
    import { $activePane as activePaneStore } from '../../stores/branch-view-store';
    import { loadAppConfig, parseStartRef, type AppConfig } from '../data/app-config';
    import { resolveChapterAudioUrl, loadBookTiming, type ResolvedAudio } from '../bw/dbt-media';
    import { loadChapterTiming, verseAtTime, baseVerseNumber, type TimingRow } from '../bw/pkf-timing';
    import { t } from '../bw/ui-locales';
    import { uiLangForRegion } from '../data/region-config';
    import { $activeRegion as activeRegionStore } from '../../stores/region-store';
    import { $parallelView as parallelViewStore, toggleParallelView } from '../../stores/parallel-view-store';
    import ParallelView from './ParallelView.svelte';
    import './reader.css';

    // UI language follows the active region (never the scripture ISO).
    const uiLang = uiLangForRegion(activeRegionStore.get());
    const tr = (k: string) => t(uiLang, 'reader.' + k);

    type Props = {
        iso: string;          // e.g. "zai"
    };
    let { iso }: Props = $props();

    // PKF asset bundle for this language (docSetId/pkfUrl/styleUrls/
    // figureUrls/media), when any canon resolves to a PKF edition —
    // resolved once on mount via the shared text-edition resolver. null
    // for PKF-less languages (helloAO-full or DBT-flat).
    let pkfExtras = $state<PkfAssets | null>(null);
    let media = $derived<MediaManifest | undefined>(pkfExtras?.media);

    let catalog = $state<Catalog | null>(null);
    let loadError = $state<string | null>(null);

    let currentBook = $state<CatalogDoc | null>(null);
    let currentChapter = $state<number>(1);
    let rendered = $state<RenderResult | null>(null);
    let rendering = $state(false);
    let renderError = $state<string | null>(null);
    let pkfLoaded = $state(false);
    let paneVisible = $state(true);

    // Per-language config from the CDN contract: attribution, text direction,
    // and the default landing reference. Fetched once per language.
    let appCfg = $state<AppConfig | null>(null);
    let textDir = $state<'ltr' | 'rtl'>('ltr');
    // Settles once appCfg/textDir are known; chapters render after it, since
    // the renderer's options come from the app-config.
    let appCfgReady: Promise<unknown> = Promise.resolve();

    // Whole-chapter audio resolved from the /dbt CDN tree (media-index +
    // per-language filesets + timing), used when the CDN media manifest
    // (`media` prop, from info.json) has no audio for this book/chapter.
    // Tries every offered fileset, keyless sources first (raw CDN file >
    // helloao > DBT proxy) — see src/lib/bw/dbt-media.ts.
    let dbtAudio = $state<ResolvedAudio | null>(null);

    // The Bible reader is only available at Standard (2) and Study (3) levels.
    function bibleAllowed(): boolean {
        if (typeof localStorage === 'undefined') return false;
        const lvl = localStorage.getItem('bw-ui-level');
        return lvl === '2' || lvl === '3';
    }

    const LINK_ATTR = 'data-bw-lang-css';
    let linkEls: HTMLLinkElement[] = [];

    onMount(async () => {
        saveLastIso(iso);
        // Per-language app-config (attribution, text direction, default ref) —
        // PKF-only (loadAppConfig gates on hasPkf internally), so this never
        // resolves for flat-mode languages; their text direction instead
        // falls back to languageNames.ts's own 'rtl' flag below.
        const appCfgPromise = loadAppConfig(iso).then((cfg) => {
            if (!cfg) return cfg;
            appCfg = cfg;
            if (cfg.collection?.textDirection) textDir = cfg.collection.textDirection;
            return cfg;
        });
        appCfgReady = appCfgPromise;
        // Resolve which (if any) canon uses a PKF edition for this language —
        // drives styleUrls/figureUrls/media/docSetId/pkfUrl/ensurePkf/glossary.
        const [ntEditions, otEditions] = await Promise.all([
            resolveTextEditions(iso, 'nt'),
            resolveTextEditions(iso, 'ot')
        ]);
        const pkfEdition = [...ntEditions, ...otEditions].find((e) => e.provider === 'pkf' && e.pkf);
        pkfExtras = pkfEdition?.pkf ?? null;

        if (!pkfExtras && nameFor(iso)?.d === 'rtl') textDir = 'rtl';
        // Swap in this language's stylesheets: the shared SAB scripture sheet
        // (+ delta.css for PKF languages). Any previously-injected links are
        // removed first so only one language's styles are live.
        document.querySelectorAll(`link[${LINK_ATTR}]`).forEach((el) => el.remove());
        linkEls = (pkfExtras?.styleUrls ?? [sabSharedStyleUrl()]).map((href) => {
            const el = document.createElement('link');
            el.rel = 'stylesheet';
            el.href = href;
            el.setAttribute(LINK_ATTR, iso);
            document.head.appendChild(el);
            return el;
        });
        document.addEventListener('click', onGlobalClick);
        document.addEventListener('keydown', onGlobalKey);
        loadBookmarks();
        try {
            catalog = await loadReaderCatalog(iso);
        } catch (e) {
            loadError = e instanceof Error ? e.message : String(e);
            return;
        }
        // Eagerly load the PKF binary in the background so the first chapter
        // open is instant instead of waiting for fetch + parse.
        if (pkfExtras) ensurePkf();

        // Initial visibility from the current pane — the default can be
        // overridden by a ?pane= signal (e.g. arriving on the study pane), which
        // fires no pane-changed event.
        paneVisible = bibleAllowed() && activePaneStore.get().pane === 'bible';
        window.addEventListener('pane-changed', ((e: CustomEvent) => {
            paneVisible = bibleAllowed() && e.detail?.pane === 'bible';
        }) as EventListener);
        // If the user drops below Standard while viewing the Bible, hide it.
        window.addEventListener('ui-level-changed', (() => {
            if (!bibleAllowed()) paneVisible = false;
        }) as EventListener);

        // Standard-mode bottom bar's Settings tab — opens this reader's
        // existing settings panel rather than a new one.
        window.addEventListener('open-reader-settings', (() => {
            showSettings = true;
        }) as EventListener);

        // Left-nav sidebars' Bookmark item, and StandardBottomBar's Audio
        // tab — these actions moved out of the topbar (see reader.css /
        // StandardSidebar / StandardBottomBar), so they're triggered via
        // window events instead of direct props now.
        window.addEventListener('toggle-bookmark', toggleBookmark);
        window.addEventListener('toggle-inline-audio', toggleInlineAudio);

        // Sidebar navigation: open a specific book+chapter on demand
        window.addEventListener('navigate-to-chapter', ((e: CustomEvent) => {
            const { book, chapter, highlightVerses } = e.detail;
            const doc = catalog?.documents.find((d) => d.bookCode === book);
            if (typeof window !== 'undefined' && window.location.search.includes('readerdebug')) {
                console.log('[readerdebug] navigate-to-chapter', { book, chapter, catalogLoaded: !!catalog, docFound: !!doc, currentBook: currentBook?.bookCode, currentChapter });
            }
            if (doc) {
                openBookChapter(doc, chapter).then(() => {
                    if (typeof window !== 'undefined' && window.location.search.includes('readerdebug')) {
                        console.log('[readerdebug] openBookChapter done', { currentBook: currentBook?.bookCode, currentChapter, hasRendered: !!rendered, renderError });
                    }
                    if (highlightVerses?.length) highlightVersesInDom(highlightVerses);
                });
            }
        }) as EventListener);

        // If arriving with Bible highlights from search, apply them after chapter
        // opens. Otherwise auto-open straight to a chapter — no intermediate
        // "choose a book" landing click; matches sab-pwa, which never makes you
        // click through an extra screen just to see the picker exists. First-ever
        // visit (nothing saved yet) prefers the language's own start-at-reference
        // over the hardcoded Matthew-1 default.
        const hlMap = bibleHighlightsStore.get();
        if (hlMap.size > 0) {
            const pos = loadLastPosition();
            const verses = hlMap.get(`${pos.book}:${pos.chapter}`) ?? [];
            const doc = catalog?.documents.find((d) => d.bookCode === pos.book);
            if (doc && verses.length) {
                openBookChapter(doc, pos.chapter).then(() => highlightVersesInDom(verses));
            }
        } else if (catalog) {
            let want = loadLastPosition();
            if (!hasLastPosition()) {
                const cfg = await appCfgPromise;
                want = parseStartRef(cfg?.features?.['start-at-reference']) ?? want;
            }
            const available = catalog.documents.map((d) => ({ bookCode: d.bookCode, chapters: chapterCount(d) }));
            const resolved = resolvePosition(want, available);
            const doc = resolved ? catalog.documents.find((d) => d.bookCode === resolved.book) : null;
            if (doc && resolved) openBookChapter(doc, resolved.chapter);
        }
    });

    onDestroy(() => {
        if (!browser) return;
        linkEls.forEach((el) => el.remove());
        linkEls = [];
        document.removeEventListener('click', onGlobalClick);
        document.removeEventListener('keydown', onGlobalKey);
    });

    async function ensurePkf() {
        if (!pkfExtras) return;
        if (pkfLoaded || isLoaded(pkfExtras.docSetId)) {
            pkfLoaded = true;
            return;
        }
        await loadDocSet(pkfExtras.docSetId, pkfExtras.pkfUrl);
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
            const [res] = await Promise.all([loadChapterDoc(iso, book.bookCode, ch), appCfgReady]);
            rendered = res ? renderChapter(res.doc, book.bookCode, ch) : null;
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

    /** Render a chapter doc through bibles' reference renderer (SAB DOM). PKF
     *  languages take their options from app-config (red letters, verse-1
     *  number, chapter number style, glossary words); other sources use the
     *  renderer's defaults, minus glossary links (they have no glossary). */
    function renderChapter(doc: Parameters<typeof renderChapterHtml>[0], bookCode: string, ch: number): RenderResult {
        const base = pkfRenderOptions(appCfg);
        const placed = media?.videos.filter(
            (v) => v.placement?.bookCode === bookCode && v.placement?.chapter === ch
        );
        const figureUrls = pkfExtras?.figureUrls ?? {};
        return renderChapterHtml(injectPlacementVideos(doc, placed), {
            ...base,
            ...(pkfExtras ? { keywordLinks: base.glossaryLinks !== false } : { glossaryLinks: false }),
            direction: textDir,
            figureUrl: (src) => figureUrls[src] ?? null,
            showImages: $settings.showIllustrations,
            showVideos: $settings.showVideos,
            captions: captionModeFor(iso),
            video: (id) => {
                const v = media?.videos.find((x) => x.id === id);
                return v ? { title: v.title, thumbnailUrl: v.thumbnailUrl } : null;
            }
        });
    }

    /** The rendered chapter's phrases (`div.seltxt[data-verse]`) covering any
     *  of `verses`. A verse spread over several paragraphs (poetry) has one
     *  phrase per paragraph; a range label ("2-3") counts for each verse. */
    function phrasesFor(verses: number[]): HTMLElement[] {
        const root = document.getElementById('content');
        if (!root || !verses.length) return [];
        return [...root.querySelectorAll<HTMLElement>('.seltxt[data-verse]')].filter((el) =>
            verses.some((n) => verseLabelIncludes(el.dataset.verse ?? '', n))
        );
    }

    function setPhraseClass(cls: string, els: HTMLElement[]) {
        document.querySelectorAll(`#content .${cls}`).forEach((el) => el.classList.remove(cls));
        els.forEach((el) => el.classList.add(cls));
    }

    function highlightVersesInDom(verses: number[]) {
        requestAnimationFrame(() => {
            const els = phrasesFor(verses);
            setPhraseClass('search-highlight', els);
            els[0]?.scrollIntoView({ block: 'center', behavior: 'smooth' });
        });
    }

    let audioTimingRows = $state<TimingRow[] | null>(null);
    let lastHighlightedVerse: number | null = null;

    function highlightPlayingVerse(verseNum: number | null) {
        if (verseNum === lastHighlightedVerse) return;
        lastHighlightedVerse = verseNum;
        setPhraseClass('audio-playing', verseNum == null ? [] : phrasesFor([verseNum]));
    }

    function handleAudioTimeUpdate(t: number) {
        if (audioTimingRows) {
            const label = verseAtTime(audioTimingRows, t);
            highlightPlayingVerse(label ? baseVerseNumber(label) : null);
            return;
        }
        if (dbtTimingVerses) {
            let match: number | null = null;
            for (const [verse, [start, end]] of Object.entries(dbtTimingVerses)) {
                if (t >= start && t < end) { match = parseInt(verse, 10); break; }
            }
            highlightPlayingVerse(Number.isFinite(match) ? match : null);
        }
    }

    /** Open the book/chapter picker, anchored under the triggering element
     * (SAB-style dropdown — see BiblePickerSheet.tsx), landing on the given
     * tab (sab-pwa has separate Book/Chapter trigger buttons in the header,
     * each opening straight to their own tab). */
    function openPicker(anchorRect?: DOMRect, initialTab: 'book' | 'chapter' = 'book') {
        window.dispatchEvent(
            new CustomEvent('open-bible-picker', { detail: { iso, anchorRect, initialTab } })
        );
    }

    // Two different left navigation panes, one per UI level: the hierarchical
    // AppSidebar (Study/level 3 only) and the flat sab-pwa-style
    // StandardSidebar (Standard/level 2 only). Same hamburger button in the
    // topbar, different event depending on which level is active.
    function openSidebar() {
        const lvl = typeof localStorage !== 'undefined' ? localStorage.getItem('bw-ui-level') : null;
        window.dispatchEvent(new CustomEvent(lvl === '2' ? 'toggle-standard-sidebar' : 'toggle-sidebar'));
    }

    let chapterList = $derived(
        currentBook ? Array.from({ length: chapterCount(currentBook) }, (_, i) => i + 1) : []
    );

    /** Format-mode tabs (Tier 2): Text is the default; Video appears only
     *  when the current chapter has chapter-level video entries. Audio has
     *  no tab of its own — it's the ♪ toggle's bottom-pinned bar instead
     *  (matches sab-pwa's single mute/volume icon, not a full mode switch;
     *  a dedicated "Audio" tab that replaced the text was redundant with it). */
    type ReaderMode = 'text' | 'video';
    let mode = $state<ReaderMode>('text');
    function setMode(m: ReaderMode) {
        mode = m;
    }
    // Fall back to Text when the current chapter doesn't have video, or
    // when settings hide it.
    $effect(() => {
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
        | { kind: 'note'; id: string }
        | { kind: 'glossary'; term: string; definition: string };
    let popover = $state<Popover | null>(null);
    let popoverEl: HTMLDivElement | null = $state(null);
    let popoverNote = $derived(
        popover?.kind === 'note' ? rendered?.notes.find((n) => n.id === (popover as { id: string }).id) : undefined
    );

    function openGlossaryPopover(term: string) {
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
        if (!pkfExtras || !isLoaded(pkfExtras.docSetId)) return;
        glossary = loadGlossary(getProskomma(), pkfExtras.docSetId);
    }

    /** Settings drawer visibility toggle. */
    let showSettings = $state(false);

    let displayHtml = $derived(rendered?.html ?? '');

    // Still used by the pinch-to-zoom gesture (doPinch, below) even though
    // the topbar's own A-/A+ buttons were removed — pinch-zoom isn't one of
    // the topbar icons, and the Settings panel's font-size slider doesn't
    // cover gesture-driven adjustment.
    const FONT_SIZE_MIN = 14;
    const FONT_SIZE_MAX = 36;
    function adjustFontSize(delta: number) {
        settings.update((s) => ({
            ...s,
            fontSize: Math.max(FONT_SIZE_MIN, Math.min(FONT_SIZE_MAX, s.fontSize + delta))
        }));
    }

    // ---- audio toggle --------------------------------------------------
    // Toggles an inline audio bar within the Text view (matches SE: the
    // icon does not leave the text — it overlays an audio player above the
    // scripture). Independent from the Audio format tab, which still gives
    // a dedicated audio-only view. Trigger moved out of the topbar to
    // StandardBottomBar's own Audio tab — listens for a window event
    // instead of a direct prop, and broadcasts its own state back so the
    // bottom bar can show enabled/active correctly.
    let audioInline = $state(false);
    function toggleInlineAudio() {
        if (chapterAudio.length === 0) return;
        audioInline = !audioInline;
    }
    $effect(() => {
        window.dispatchEvent(new CustomEvent('audio-bar-state-changed', {
            detail: { hasAudio: chapterAudio.length > 0, inline: audioInline }
        }));
    });

    // ---- bookmark toggle -------------------------------------------
    // Trigger moved out of the topbar to the left-nav sidebars (see
    // src/lib/bw/bookmarks.ts) — listens for a window event instead of a
    // direct prop, and broadcasts state changes back so the sidebars can
    // reflect the current chapter's bookmark state.
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
        window.dispatchEvent(new CustomEvent('bookmark-state-changed'));
    }

    // ---- top-bar title -----------------------------------------------------
    // Split into separate Book/Chapter labels — the topbar shows them as two
    // independent dropdown triggers (sab-pwa's BookSelector/ChapterSelector),
    // not one combined title button.
    let bookLabel = $derived(
        currentBook ? (currentBook.toc2 ?? currentBook.toc ?? currentBook.bookCode) : iso
    );
    let chapterLabel = $derived(String(currentChapter));
    function onGlobalClick(e: MouseEvent) {
        if (!popover) return;
        const target = e.target as Node | null;
        if (popoverEl && target && popoverEl.contains(target)) return;
        // Ignore clicks on callers — their own handler manages the popover state.
        if (target instanceof HTMLElement && target.closest('#content a.footnote-caller, #content a.glossary')) return;
        closePopover();
    }
    function onGlobalKey(e: KeyboardEvent) {
        if (e.key === 'Escape' && popover) closePopover();
    }

    /** Audio entries from the CDN media manifest for the current book+chapter. */
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

    // Verse-synced audio highlighting (PKF timing/<BOOK>-<chapter>.json,
    // spec §9) — only ever published for chapters that have the local
    // SE-native audio (audioForChapter), so gate on that instead of firing
    // blind: a language with no audio at all (audioForChapter always empty)
    // would otherwise 404 a timing request on every single chapter view.
    // Even gated, an audio-having chapter can still lack timing specifically
    // (delivered per-chapter, not guaranteed) — a 404 there is expected per
    // spec, not a bug; loadChapterTiming() already no-ops on it silently.
    $effect(() => {
        const book = currentBook?.bookCode;
        const ch = currentChapter;
        audioTimingRows = null;
        lastHighlightedVerse = null;
        if (!book || audioForChapter.length === 0) return;
        let cancelled = false;
        loadChapterTiming(iso, book, ch).then((rows) => { if (!cancelled) audioTimingRows = rows; });
        return () => { cancelled = true; };
    });

    // When the CDN media manifest has no audio for this chapter, resolve the
    // /dbt CDN tree instead (covers both NT and OT, whichever filesets that
    // language actually offers — not limited to a single hand-picked fileset).
    $effect(() => {
        const book = currentBook?.bookCode;
        const ch = currentChapter;
        dbtAudio = null;
        if (!book || audioForChapter.length > 0) return;
        let cancelled = false;
        resolveChapterAudioUrl(iso, book, ch).then((r) => { if (!cancelled) dbtAudio = r; });
        return () => { cancelled = true; };
    });

    // Verse-sync highlighting for DBT-sourced audio — a separate timing
    // system from the PKF-native one above (§9), keyed by DBT audio fileset
    // id: {[filesetId]: {[chapter]: {[verse]: [start, end]}}}. Only
    // attempted for source "dbt" (raw/contrib fileset ids follow a
    // non-DBT naming scheme, not guaranteed to appear in this file).
    //
    // Source "helloao" (see dbt-media.ts's module doc comment — currently
    // just BSB/hays) carries its own real per-verse start times directly
    // on the ResolvedAudio itself (verseStarts), fetched alongside the
    // audio URL in the same call — no separate lookup needed, unlike DBT's
    // loadBookTiming. Converted to the same {[verse]: [start, end]} shape
    // here: verse N's end = verse N+1's start; the last verse has no known
    // end (helloAO doesn't publish one), so it gets the same "+30s, no
    // real end known" fallback convention used elsewhere in this app for
    // exactly this situation (e.g. StoryReaderIsland's zero-duration fix).
    let dbtTimingVerses = $state<Record<string, [number, number]> | null>(null);
    $effect(() => {
        const book = currentBook?.bookCode;
        const ch = currentChapter;
        const audio = dbtAudio;
        dbtTimingVerses = null;
        if (!book || !audio) return;

        if (audio.source === 'helloao') {
            const starts = audio.verseStarts;
            if (!starts?.length) return;
            const verses: Record<string, [number, number]> = {};
            for (let i = 0; i < starts.length; i++) {
                const start = starts[i];
                const end = i + 1 < starts.length ? starts[i + 1] : start + 30;
                verses[String(i + 1)] = [start, end];
            }
            dbtTimingVerses = verses;
            return;
        }

        if (audio.source !== 'dbt') return;
        let cancelled = false;
        loadBookTiming(iso, book).then((timing) => {
            if (cancelled) return;
            dbtTimingVerses = timing?.[audio.filesetId]?.[String(ch)] ?? null;
        });
        return () => { cancelled = true; };
    });

    /** Audio to actually play — CDN media if present, else the /dbt stream. */
    let chapterAudio = $derived<AudioEntry[]>(
        audioForChapter.length > 0
            ? audioForChapter
            : dbtAudio && currentBook
              ? [{
                    filename: `${currentBook.bookCode}-${currentChapter}`,
                    url: dbtAudio.url,
                    bookCode: currentBook.bookCode,
                    chapter: currentChapter,
                    num: null, len: null, size: null, timingFile: null, src: dbtAudio.source,
                }]
              : []
    );
    /** Videos attached to the current book+chapter. Split by whether they
     * have a verse-level placement: ones with a verse become the renderer's
     * `div.video-block`s between paragraphs (injectPlacementVideos), the rest
     * go in the top strip above the chapter body. */
    let videosForChapter = $derived<VideoEntry[]>(
        currentBook && media
            ? media.videos.filter(
                  (v) =>
                      v.placement?.bookCode === currentBook!.bookCode &&
                      v.placement?.chapter === currentChapter
              )
            : []
    );
    let topVideos = $derived<VideoEntry[]>(
        videosForChapter.filter((v) => v.placement?.verse == null)
    );

    /** Which top-strip video thumbnail has been clicked open; keyed by video.id.
     * In-text video blocks (inside {@html}) are handled via imperative DOM
     * replacement on click so the player survives re-renders of neighbouring state. */
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

    /** Click / keydown delegation for the rendered scripture body (SAB DOM
     *  from render.js). Handles:
     *   - video blocks        → replace in place with a real player
     *   - footnote/xref callers (a.footnote-caller) → open popover
     *   - glossary words (a.glossary[match])        → open popover
     *   - phrase taps (.seltxt[data-verse])         → toggle verse selection
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

        const videoBlock = target.closest<HTMLElement>('.video-block[data-video-id]');
        if (videoBlock) {
            e.preventDefault();
            const v = media?.videos.find((x) => x.id === videoBlock.dataset.videoId);
            if (v) videoBlock.replaceWith(buildPlayerElement(v));
            return;
        }

        const caller = target.closest<HTMLElement>('a.footnote-caller[data-note]');
        if (caller) {
            e.preventDefault();
            popover = { kind: 'note', id: caller.dataset.note ?? '' };
            return;
        }

        // Glossary word (\w, and \k for PKF) — lazy-build the glossary map on first use.
        const term = target.closest<HTMLElement>('a.glossary[match]');
        if (term) {
            e.preventDefault();
            const match = term.getAttribute('match') ?? '';
            if (match) openGlossaryPopover(match);
            return;
        }

        // Phrase tap → toggle .selected. Imperative DOM toggle so opened
        // inline video players are not disturbed by re-renders. A verse has a
        // phrase per paragraph it spans — toggle them together.
        const phrase = target.closest<HTMLElement>('.seltxt[data-verse]');
        if (phrase) {
            const label = phrase.dataset.verse ?? '';
            const selecting = !phrase.classList.contains('selected');
            document
                .querySelectorAll(`#content .seltxt[data-verse="${CSS.escape(label)}"]`)
                .forEach((el) => el.classList.toggle('selected', selecting));
        }
    }
</script>

<div style:display={paneVisible ? '' : 'none'}>
{#if loadError}
    <div class="alert alert-error text-sm">{tr('catalogFailed')}: {loadError}</div>
{:else if !catalog}
    <div class="text-sm text-base-content/60">{tr('loadingCatalog')}</div>
{:else if !currentBook}
    <!-- Transient: onMount auto-opens a chapter (last position, or the
         language's start-at-reference on a first-ever visit) the instant the
         catalog resolves — no "choose a book" click gate, matching sab-pwa. -->
    <div class="text-sm text-base-content/60">{tr('loadingChapter')}</div>
{:else}
    <section>
        <ReaderTopBar
            {bookLabel}
            {chapterLabel}
            onBookTap={(r) => openPicker(r, 'book')}
            onChapterTap={(r) => openPicker(r, 'chapter')}
            onMenu={openSidebar}
            onParallelView={toggleParallelView}
            parallelViewActive={$parallelViewStore}
        />

        <!-- Floating side arrows: vertically centred on the viewport, hidden on
             narrow screens (mobile uses swipe). Mirror SAB's reading layout. -->
        <button
            type="button"
            class="reader-side-nav left"
            class:visible={currentChapter > 1}
            onclick={prevChapter}
            aria-label={tr('prevChapter')}
        >
            ‹
        </button>
        <button
            type="button"
            class="reader-side-nav right"
            class:visible={currentChapter < chapterList.length}
            onclick={nextChapter}
            aria-label={tr('nextChapter')}
        >
            ›
        </button>

        {#if showSettings}
            <SettingsPanel onclose={() => (showSettings = false)} />
        {/if}

        {#if $settings.showVideos && videosForChapter.length > 0}
            <div class="reader-format-tabs">
                <button
                    type="button"
                    class:active={mode === 'text'}
                    onclick={() => setMode('text')}
                >
                    {tr('tabText')}
                </button>
                <button
                    type="button"
                    class:active={mode === 'video'}
                    onclick={() => setMode('video')}
                >
                    {tr('tabVideo')}
                </button>
            </div>
        {/if}

        <!-- id="container" + data-iso scope the CDN styles/delta.css (fonts + colour
             variables). delta.css keys its palette on data-color-theme; only the
             Normal one is used. -->
        <div
            id="container"
            class="reader-root"
            data-iso={iso}
            data-color-theme="Normal"
            dir={textDir}
            style={`font-size:${$settings.fontSize}px;line-height:${$settings.lineHeight}`}
        >
            {#if mode === 'video' && videosForChapter.length > 0 && $settings.showVideos}
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
                                    aria-label={`${tr('play')} ${v.title}`}
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

            {#if mode === 'text' && $parallelViewStore && currentBook}
                <div class="reader-body reader-body-parallel">
                    <ParallelView
                        bookCode={currentBook.bookCode}
                        chapter={currentChapter}
                        {iso}
                    />
                </div>
            {:else if mode === 'text'}
                <!-- svelte-ignore a11y_click_events_have_key_events -->
                <!-- svelte-ignore a11y_no_static_element_interactions -->
                <div
                    id="content"
                    class="reader-body"
                    class:has-bottom-bar={audioInline && chapterAudio.length > 0}
                    onclick={handleBodyClick}
                    onkeydown={handleBodyClick}
                    {...useSwipe(doSwipe, () => ({
                        timeframe: 300,
                        minSwipeDistance: 60,
                        touchAction: 'pan-y'
                    }))}
                    {...usePinch(doPinch, () => ({ touchAction: 'pan-y' }))}
                >
                    {#if rendering}
                        <div class="text-sm text-base-content/60">{tr('loadingChapter')}</div>
                    {:else if renderError}
                        <div class="alert alert-error text-sm">{renderError}</div>
                    {:else if rendered}
                        {#if rendered.introduction}
                            <details class="reader-intro">
                                <summary>{tr('introduction')}</summary>
                                {@html rendered.introduction}
                            </details>
                        {/if}
                        {@html displayHtml}
                    {:else}
                        <div class="text-sm text-base-content/60">{tr('noContent')}</div>
                    {/if}
                </div>
            {/if}
        </div>

        <!-- Bottom-pinned inline audio bar (toggle via ♪ in the topbar). -->
        {#if mode === 'text' && audioInline && chapterAudio.length > 0}
            <div class="reader-audio-bottom">
                {#each chapterAudio as a (a.filename)}
                    {#if a.url}
                        <AudioPlayer
                            src={a.url}
                            label={`${a.bookCode ?? ''} ${a.chapter ?? ''}`.trim()}
                            onTimeUpdate={handleAudioTimeUpdate}
                        />
                    {/if}
                {/each}
            </div>
        {/if}

        {#if popover}
            <div
                class="reader-note-popover"
                class:above-audio={audioInline && chapterAudio.length > 0}
                bind:this={popoverEl}
                role="dialog"
                aria-label={popover.kind === 'glossary'
                    ? tr('glossary')
                    : popoverNote?.kind === 'xref'
                      ? tr('crossRef')
                      : tr('footnote')}
            >
                <button class="close" type="button" aria-label={tr('close')} onclick={closePopover}>
                    ×
                </button>
                {#if popover.kind === 'glossary'}
                    <div class="popover-term">{popover.term}</div>
                    <div class="note-body">{popover.definition}</div>
                {:else if popoverNote}
                    <div class="note-body">{@html popoverNote.html}</div>
                {/if}
            </div>
        {/if}
    </section>
{/if}

{#if appCfg?.copyright}
    <footer class="reader-copyright">
        <span class="reader-copyright-license">{appCfg.copyright.license}</span>
        {#if appCfg.copyright.holder}
            <span class="reader-copyright-holder"> · {appCfg.copyright.holder}</span>
        {/if}
    </footer>
{/if}
</div>
