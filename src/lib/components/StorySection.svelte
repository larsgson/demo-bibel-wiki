<script lang="ts">
    import type { Section, ImageConfig } from '../templates/types';
    import { resolveImageUrl, resolveThumbUrl } from '../templates/imageUrl';

    type Props = {
        section: Section;
        sectionIndex: number;
        imageConfig: ImageConfig | null;
        active: boolean;
        clickable: boolean;
        onclick?: (idx: number) => void;
    };
    let { section, sectionIndex, imageConfig, active, clickable, onclick }: Props = $props();

    function handle(e: MouseEvent | KeyboardEvent) {
        if (!clickable) return;
        if (e.type === 'keydown') {
            const ke = e as KeyboardEvent;
            if (ke.key !== 'Enter' && ke.key !== ' ') return;
            e.preventDefault();
        }
        onclick?.(sectionIndex);
    }
</script>

<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
<div
    class="story-section"
    class:clickable
    class:active
    role={clickable ? 'button' : undefined}
    tabindex={clickable ? 0 : undefined}
    onclick={handle}
    onkeydown={handle}
>
    {#if section.imageUrls.length > 0}
        <div class="story-section-images">
            {#each section.imageUrls as url, i (url + i)}
                {@const medium = resolveImageUrl(url, imageConfig)}
                {@const thumb = resolveThumbUrl(url, imageConfig)}
                <img
                    src={medium}
                    alt={`Section ${sectionIndex + 1}`}
                    loading={sectionIndex < 2 ? 'eager' : 'lazy'}
                    decoding="async"
                    onerror={(e) => {
                        const img = e.currentTarget as HTMLImageElement;
                        if (thumb && img.src !== thumb) img.src = thumb;
                    }}
                />
            {/each}
            {#if section.reference}
                <div class="story-section-ref">{section.reference}</div>
            {/if}
        </div>
    {:else if section.reference}
        <div class="story-section-ref-inline">{section.reference}</div>
    {/if}

    {#if section.heading}
        <h3 class="story-section-heading">{section.heading}</h3>
    {/if}

    {#if section.text?.trim()}
        <div class="story-section-text">
            {#each section.text.split('\n') as line, i (i)}
                {@const trimmed = line.trim()}
                {#if trimmed}
                    <p>{trimmed}</p>
                {/if}
            {/each}
        </div>
    {/if}
</div>

<style>
    .story-section {
        display: flex;
        flex-direction: column;
        gap: 0.55rem;
        padding: 0.85rem 0.95rem;
        border-radius: 14px;
        border: 1px solid rgba(0, 11, 99, 0.1);
        background: #fff;
        transition: box-shadow 220ms ease, border-color 180ms ease, transform 200ms ease;
    }
    .story-section.clickable { cursor: pointer; }
    .story-section.clickable:hover,
    .story-section.clickable:focus-visible {
        border-color: rgba(0, 11, 99, 0.4);
        box-shadow: 0 14px 30px -16px rgba(0, 11, 99, 0.35);
        outline: none;
    }
    .story-section.active {
        border-color: rgba(34, 197, 94, 0.7);
        box-shadow:
            0 0 0 3px rgba(34, 197, 94, 0.18),
            0 14px 30px -16px rgba(0, 11, 99, 0.35);
    }

    .story-section-images {
        position: relative;
        display: grid;
        gap: 0.4rem;
        margin: -0.85rem -0.95rem 0;
    }
    .story-section-images img {
        width: 100%;
        aspect-ratio: 16 / 9;
        object-fit: cover;
        background: rgba(0, 11, 99, 0.05);
    }
    .story-section-images img:first-child {
        border-radius: 14px 14px 0 0;
    }
    .story-section-ref {
        position: absolute;
        bottom: 0.55rem;
        left: 0.55rem;
        padding: 0.18rem 0.55rem;
        border-radius: 999px;
        background: rgba(0, 11, 99, 0.78);
        color: #fff;
        font-size: 0.78rem;
        font-weight: 600;
        letter-spacing: 0.01em;
    }
    .story-section-ref-inline {
        align-self: flex-start;
        padding: 0.18rem 0.55rem;
        border-radius: 999px;
        background: rgba(0, 11, 99, 0.08);
        color: rgb(0, 11, 99);
        font-size: 0.78rem;
        font-weight: 600;
        letter-spacing: 0.01em;
    }
    .story-section-heading {
        font-size: 1rem;
        font-weight: 600;
        color: rgb(0, 11, 99);
        margin: 0.1rem 0 0;
    }
    .story-section-text {
        color: rgb(0, 11, 99);
        line-height: 1.55;
        font-size: 0.98rem;
    }
    .story-section-text p { margin: 0 0 0.45rem; }
    .story-section-text p:last-child { margin-bottom: 0; }
</style>
