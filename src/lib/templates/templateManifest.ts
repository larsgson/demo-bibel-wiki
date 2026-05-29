import { parse as parseToml } from 'smol-toml';
import type {
    TemplateName,
    TemplateIndex,
    CategoryIndex,
    StoryDef,
    ImageConfig
} from './types';

/**
 * All template metadata is bundled at build time — index.toml + category
 * index.toml + manifest.json. Combined ~80 KB across the three templates.
 * Story markdown is loaded lazily (one file per opened story).
 */
const tomlFiles = import.meta.glob<string>(
    ['./content/*/index.toml', './content/*/*/index.toml'],
    { query: '?raw', import: 'default', eager: true }
);
const mdFiles = import.meta.glob<string>(
    ['./content/*/*/*.md', './content/*/*/*/*.md'],
    { query: '?raw', import: 'default', eager: false }
);

function loadToml<T>(path: string): T | null {
    const raw = tomlFiles[path];
    if (!raw) return null;
    try {
        return parseToml(raw) as T;
    } catch {
        return null;
    }
}

export function templateRoot(template: TemplateName): TemplateIndex | null {
    return loadToml<TemplateIndex>(`./content/${template}/index.toml`);
}

export function categoryRoot(template: TemplateName, categoryId: string): CategoryIndex | null {
    return loadToml<CategoryIndex>(`./content/${template}/${categoryId}/index.toml`);
}

/** Resolve the list of category IDs for a template, regardless of whether
 *  the index uses `categories = ["01", …]` or `[[categories]]` arrays.
 *  Also accepts the OBS quirk where `categories` is parsed under [images]
 *  because the array sits inside that TOML table without an explicit reset. */
export function categoryIdsFor(template: TemplateName): string[] {
    const idx = templateRoot(template);
    if (!idx) return [];
    const raw =
        idx.categories ??
        (idx as unknown as { images?: { categories?: unknown } }).images?.categories;
    if (!raw) return [];
    if (Array.isArray(raw) && typeof raw[0] === 'string') {
        return raw as string[];
    }
    return (raw as { id: string }[]).map((c) => c.id);
}

export function categoryDefFor(
    template: TemplateName,
    categoryId: string
): { id: string; image: string } | null {
    const idx = templateRoot(template);
    if (!idx) return null;
    const raw =
        idx.categories ??
        (idx as unknown as { images?: { categories?: unknown } }).images?.categories;
    if (Array.isArray(raw) && raw.length > 0 && typeof raw[0] === 'object') {
        const def = (raw as { id: string; image: string }[]).find((c) => c.id === categoryId);
        return def ?? null;
    }
    // OBS-style (string-id list): category image is at <cat>/index.toml's [image].filename.
    const cat = categoryRoot(template, categoryId);
    if (!cat) return null;
    return { id: categoryId, image: cat.image?.filename ?? '' };
}

export function storiesFor(template: TemplateName, categoryId: string): StoryDef[] {
    const cat = categoryRoot(template, categoryId);
    return cat?.stories ?? [];
}

export function imageConfigFor(template: TemplateName): ImageConfig | null {
    return templateRoot(template)?.images ?? null;
}

export function canonFor(template: TemplateName, categoryId: string): 'nt' | 'ot' | null {
    return categoryRoot(template, categoryId)?.canon ?? null;
}

/**
 * Lazy-load the markdown for a single story. Returns the raw .md text
 * (or null if the story doesn't exist).
 */
export async function loadStoryMarkdown(
    template: TemplateName,
    categoryId: string,
    storyId: string
): Promise<string | null> {
    const path = `./content/${template}/${categoryId}/${storyId}.md`;
    const loader = mdFiles[path];
    if (!loader) return null;
    try {
        return await loader();
    } catch {
        return null;
    }
}
