<script lang="ts">
    import { TEMPLATES, type TemplateName } from '../templates/types';
    import {
        templateRoot,
        imageConfigFor,
        categoryIdsFor,
        categoryDefFor,
        storiesFor
    } from '../templates/templateManifest';
    import { loadLocale, localeLookup } from '../templates/locales';
    import { resolveImageUrl, resolveThumbUrl } from '../templates/imageUrl';

    type Props = { iso: string; localeCode?: string };
    let { iso, localeCode = 'spa' }: Props = $props();

    type Card = {
        name: TemplateName;
        title: string;
        sub: string;
        href: string;
        image: string;
    };

    function templateImage(name: TemplateName): string {
        const root = templateRoot(name);
        if (!root) return '';
        const cfg = imageConfigFor(name);
        // 1. Explicit [image].filename from the template root.
        if (root.image?.filename) return resolveImageUrl(root.image.filename, cfg);
        const ids = categoryIdsFor(name);
        const firstId = ids[0];
        if (!firstId) return '';
        // 2. First category's image — but only if it's clearly a story-style
        //    JPEG (some templates point this at an icon PNG that isn't on the
        //    image CDN, e.g. OBS's "000-01.png").
        const def = categoryDefFor(name, firstId);
        if (def?.image && /\.jpe?g$/i.test(def.image)) {
            return resolveImageUrl(def.image, cfg);
        }
        // 3. First story image of the first category — always on the CDN
        //    because it's the same image used in the chapter grid.
        const first = storiesFor(name, firstId)[0];
        if (first?.image) return resolveImageUrl(first.image, cfg);
        // 4. Final fallback: the category image (even if it's an icon PNG).
        if (def?.image) return resolveImageUrl(def.image, cfg);
        return '';
    }

    const cards = $derived.by<Card[]>(() => {
        const out: Card[] = [];
        for (const t of TEMPLATES) {
            const root = templateRoot(t.name);
            if (!root) continue;
            const localeMap = loadLocale(t.name, localeCode);
            const fallbackMap = loadLocale(t.name, 'eng');
            const title =
                localeLookup(localeMap, 'title') ??
                localeLookup(fallbackMap, 'title') ??
                t.label;
            out.push({
                name: t.name,
                title,
                sub: t.description,
                href: `/${iso}/${t.name}`,
                image: templateImage(t.name)
            });
        }
        return out;
    });
</script>

<section class="stories-grid">
    <h2 class="stories-grid-title">Bible Stories</h2>
    <ul class="stories-grid-list">
        {#each cards as card (card.name)}
            <li>
                <a href={card.href} class="stories-grid-card">
                    <div class="stories-grid-image">
                        {#if card.image}
                            <img
                                src={card.image}
                                alt={card.title}
                                loading="lazy"
                                decoding="async"
                            />
                        {:else}
                            <div class="stories-grid-placeholder" aria-hidden="true">📖</div>
                        {/if}
                        <div class="stories-grid-overlay">
                            <span class="stories-grid-card-title">{card.title}</span>
                            <span class="stories-grid-card-sub">{card.sub}</span>
                        </div>
                    </div>
                </a>
            </li>
        {/each}
    </ul>
</section>

<style>
    .stories-grid { margin-bottom: 2rem; }
    .stories-grid-title {
        font-size: 1.25rem;
        font-weight: 700;
        color: rgb(0, 11, 99);
        letter-spacing: -0.01em;
        margin: 0 0 0.75rem;
    }
    .stories-grid-list {
        display: grid;
        grid-template-columns: 1fr;
        gap: 0.85rem;
        list-style: none;
        padding: 0;
        margin: 0;
    }
    @media (min-width: 640px) {
        .stories-grid-list {
            grid-template-columns: repeat(2, 1fr);
        }
    }
    @media (min-width: 1024px) {
        .stories-grid-list {
            grid-template-columns: repeat(3, 1fr);
        }
    }
    .stories-grid-card {
        display: block;
        border: 1px solid rgba(0, 11, 99, 0.1);
        border-radius: 14px;
        overflow: hidden;
        text-decoration: none;
        background: #fff;
        transition: transform 200ms ease, box-shadow 220ms ease, border-color 180ms ease;
    }
    .stories-grid-card:hover, .stories-grid-card:focus-visible {
        transform: translateY(-2px);
        border-color: rgba(0, 11, 99, 0.4);
        box-shadow: 0 16px 36px -16px rgba(0, 11, 99, 0.4);
        outline: none;
    }
    .stories-grid-image {
        position: relative;
        aspect-ratio: 16 / 9;
        background: rgba(0, 11, 99, 0.05);
        overflow: hidden;
    }
    .stories-grid-image img {
        width: 100%;
        height: 100%;
        object-fit: cover;
        transition: transform 320ms ease;
    }
    .stories-grid-card:hover .stories-grid-image img {
        transform: scale(1.04);
    }
    .stories-grid-placeholder {
        width: 100%;
        height: 100%;
        display: grid;
        place-items: center;
        font-size: 3rem;
    }
    .stories-grid-overlay {
        position: absolute;
        inset: 0;
        display: flex;
        flex-direction: column;
        justify-content: flex-end;
        padding: 0.85rem 1rem;
        background: linear-gradient(to top, rgba(0, 11, 99, 0.85), rgba(0, 11, 99, 0) 60%);
        color: #fff;
    }
    .stories-grid-card-title {
        font-size: 1.1rem;
        font-weight: 700;
        letter-spacing: -0.01em;
        line-height: 1.2;
    }
    .stories-grid-card-sub {
        font-size: 0.78rem;
        color: rgba(255, 255, 255, 0.85);
        margin-top: 0.15rem;
    }
</style>
