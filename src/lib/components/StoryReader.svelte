<script lang="ts">
    import { onMount } from 'svelte';
    import type { TemplateName, Section, VerseEntry, ImageConfig } from '../templates/types';
    import { loadStoryMarkdown, imageConfigFor, canonFor } from '../templates/templateManifest';
    // Pankosmia overlay disabled — see docs/change-indicator.md
    // import { editedContentVersion, getEditedObsMap } from '../data/editedContent';
    import { loadLocale } from '../templates/locales';
    import { parseStoryMarkdown } from '../templates/markdownParser';
    import { parseReference, splitReference } from '../templates/refs';
    import { chapterVerses } from '../templates/verseText';
    import { buildAudioIndex, audioFor } from '../templates/audioUrl';
    import { loadTiming, rangeForReference } from '../templates/timingTsv';
    import type { MediaManifest } from '../data/pkfInfo';
    import StorySection from './StorySection.svelte';
    import RangedAudioPlayer, { type AudioCue } from './RangedAudioPlayer.svelte';

    type Props = {
        template: TemplateName;
        categoryId: string;
        storyId: string;
        iso: string;
        docSetId: string;
        pkfUrl: string;
        catalog?: import('$lib/reader/catalog').Catalog | null;
        media?: MediaManifest;
        /** Locale code for [[t:…]] resolution. Mexican langs default to 'spa'. */
        localeCode?: string;
    };
    let {
        template,
        categoryId,
        storyId,
        iso,
        docSetId,
        pkfUrl,
        catalog = null,
        media,
        localeCode = 'spa'
    }: Props = $props();

    let title = $state('');
    let baseSections = $state<Section[]>([]);
    let imageConfig: ImageConfig | null = $state(null);
    let cues = $state<AudioCue[]>([]);
    let currentCueIdx = $state<number | null>(null);
    let loadError = $state<string | null>(null);
    let loading = $state(true);
    const audioIndex = $derived(buildAudioIndex(media));

    const sections = $derived(baseSections);

    // Pankosmia edited-content overlay disabled — see docs/change-indicator.md
    // When re-enabled, this section subscribed to editedContentVersion and
    // overlaid edited text onto OBS OT story sections with empty verse text.

    async function build() {
        loading = true;
        loadError = null;
        try {
            const md = await loadStoryMarkdown(template, categoryId, storyId);
            if (!md) {
                loadError = 'Story not found';
                return;
            }
            imageConfig = imageConfigFor(template);
            const localeMap = loadLocale(template, localeCode);
            const fallbackMap = loadLocale(template, 'eng');

            // 1. Determine which chapters we need verse text for.
            const tmpParsed = parseStoryMarkdown(md, {}, localeMap, fallbackMap);
            const refs = new Set<string>();
            for (const s of tmpParsed.sections) {
                if (s.reference) refs.add(s.reference);
                for (const m of s.text.matchAll(/\[\[ref:\s*(.+?)\]\]/g)) refs.add(m[1].trim());
            }
            const chapterKeys = new Set<string>();
            for (const ref of refs) {
                for (const part of splitReference(ref)) {
                    const p = parseReference(part);
                    if (!p) continue;
                    chapterKeys.add(`${p.book}|${p.chapter}`);
                }
            }

            // 2. Fetch all chapter verse texts in parallel.
            const chapterText: Record<string, VerseEntry[]> = {};
            await Promise.all(
                Array.from(chapterKeys).map(async (key) => {
                    const [book, chStr] = key.split('|');
                    const ch = parseInt(chStr, 10);
                    const verses = await chapterVerses(docSetId, pkfUrl, book, ch, catalog);
                    chapterText[`${book} ${ch}`] = verses;
                })
            );

            // 3. Re-parse markdown WITH chapter text so [[ref:…]] inline tokens
            //    get resolved to actual verse text.
            const parsed = parseStoryMarkdown(md, chapterText, localeMap, fallbackMap);
            title = parsed.title;
            baseSections = parsed.sections;

            // 4. Build audio cues — one per section that has a reference AND
            //    valid audio + timing for at least one of its verses.
            const newCues: AudioCue[] = [];
            await Promise.all(
                parsed.sections.map(async (s, idx) => {
                    if (!s.reference) return;
                    // Use the FIRST single-ref of the section (the simplest case).
                    const firstPart = splitReference(s.reference)[0];
                    const ref = firstPart ? parseReference(firstPart) : null;
                    if (!ref) return;
                    const audio = audioFor(audioIndex, ref.book, ref.chapter);
                    if (!audio || !audio.timingFile) return;
                    const timing = await loadTiming(audio.timingFile);
                    if (!timing) return;
                    const range = rangeForReference(timing, ref);
                    if (!range) return;
                    newCues.push({
                        sectionIndex: idx,
                        audioUrl: audio.url,
                        start: range.start,
                        end: range.end
                    });
                })
            );
            // Sort by section order so auto-advance follows the story.
            newCues.sort((a, b) => a.sectionIndex - b.sectionIndex);
            cues = newCues;
        } catch (e) {
            loadError = e instanceof Error ? e.message : String(e);
        } finally {
            loading = false;
        }
    }

    onMount(build);

    function handleSectionClick(sectionIdx: number) {
        const cueIdx = cues.findIndex((c) => c.sectionIndex === sectionIdx);
        if (cueIdx < 0) return;
        currentCueIdx = cueIdx;
        // Imperative jump via the player's exposed API not used here — we set
        // currentCueIdx and re-render; the player picks up via prop change.
        // But we also need to actually start playback.
        playerRef?.playCue(cueIdx);
    }

    let playerRef: { playCue: (idx: number) => void } | undefined = $state();
    const activeSectionIdx = $derived(currentCueIdx == null ? -1 : cues[currentCueIdx]?.sectionIndex ?? -1);
</script>

{#if loading}
    <div class="story-reader-shell"><div class="story-status">Cargando historia…</div></div>
{:else if loadError}
    <div class="story-reader-shell"><div class="story-status story-error">{loadError}</div></div>
{:else}
<div class="story-reader-shell">
    {#if title}
        <h1 class="story-title">{title}</h1>
    {/if}
    <div class="story-sections">
        {#each sections as section, i (i)}
            <StorySection
                {section}
                sectionIndex={i}
                {imageConfig}
                active={activeSectionIdx === i}
                clickable={cues.some((c) => c.sectionIndex === i)}
                onclick={handleSectionClick}
            />
        {/each}
    </div>
    {#if cues.length > 0}
        <RangedAudioPlayer
            bind:this={playerRef}
            cues={cues}
            currentIdx={currentCueIdx}
            oncuechange={(idx) => (currentCueIdx = idx)}
        />
    {/if}
</div>
{/if}

<style>
    /* Match bibel-wiki's narrow story-page container so section images
     * don't stretch wider than the picker grid. */
    .story-reader-shell {
        max-width: 700px;
        margin: 0 auto;
    }
    .story-title {
        font-size: 1.6rem;
        font-weight: 700;
        color: rgb(0, 11, 99);
        letter-spacing: -0.01em;
        margin: 0 0 1rem;
    }
    .story-sections {
        display: flex;
        flex-direction: column;
        gap: 0.85rem;
        padding-bottom: 100px; /* leave room for the sticky audio bar */
    }
    .story-status {
        padding: 1rem;
        color: rgba(0, 11, 99, 0.65);
    }
    .story-error {
        color: rgb(146 64 14);
        background: rgba(217, 119, 6, 0.1);
        border-radius: 10px;
    }
</style>
