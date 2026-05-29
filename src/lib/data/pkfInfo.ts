/**
 * Per-language info.json loader.
 *
 * info.json files are intentionally NOT eagerly bundled — each one is 90 KB
 * on average (up to 246 KB for languages with big media manifests), and
 * bundling all 139 inflates the shared chunk to ~7 MB uncompressed. Instead,
 * each info.json becomes its own lazy chunk that the browser fetches only
 * when the user navigates to that ISO's page.
 *
 * Per-language pkf sizes live in manifest.json (see `pkfSizeBytes` in
 * regions.ts) and are always available synchronously; no need to load the
 * full info.json just to show a KB total on the region-list page.
 */

export type InfoJson = {
    iso: string;
    version: string | null;
    source: string;
    fetched_at: string;
    /** Non-pkf data type (e.g. 'bsb' for the Berean Standard Bible). */
    type?: string;
    style_delta?: string | null;
    figure_urls?: Record<string, string>;
    figures?: Array<{ bookCode: string; filename: string | null; caption: string }>;
    media?: MediaManifest;
    assets: Array<{
        name: string;
        kind: 'pkf' | 'json' | 'css' | 'font';
        base: string;
        hash: string;
        url: string;
        action?: string;
        size?: number;
    }>;
};

export type VideoKind = 'youtube' | 'hls' | 'arclight' | 'vimeo' | 'file' | 'other';

export type VideoEntry = {
    id: string;
    title: string;
    width: number | null;
    height: number | null;
    thumbnail: string | null;
    thumbnailUrl: string | null;
    onlineUrl: string;
    kind: VideoKind;
    placement: {
        bookCode?: string;
        chapter?: number;
        verse?: number | null;
        pos?: string | null;
        collection?: string | null;
        rawRef?: string;
    };
};

export type AudioEntry = {
    filename: string;
    url: string | null;
    bookCode: string | null;
    chapter: number | null;
    num: number | null;
    len: number | null;
    size: number | null;
    timingFile: string | null;
    src: string;
};

export type MediaManifest = {
    videos: VideoEntry[];
    audio: {
        base_url: string | null;
        items: AudioEntry[];
    };
};

// Lazy glob — each info.json becomes its own on-demand chunk.
const infoLoaders = import.meta.glob<InfoJson>('../../../data/pkf/*/info.json', {
    import: 'default'
});

const loaderByIso = new Map<string, () => Promise<InfoJson>>();
for (const [path, loader] of Object.entries(infoLoaders)) {
    const m = path.match(/\/data\/pkf\/([^/]+)\/info\.json$/);
    if (m) loaderByIso.set(m[1], loader as () => Promise<InfoJson>);
}

export async function loadInfo(iso: string): Promise<InfoJson | null> {
    const loader = loaderByIso.get(iso);
    if (!loader) return null;
    return await loader();
}

export function formatKB(bytes: number): string {
    if (!bytes) return '—';
    return `${(bytes / 1024).toFixed(0)} KB`;
}
