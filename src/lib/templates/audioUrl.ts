import type { AudioEntry, MediaManifest } from '../data/pkfInfo';

export interface ChapterAudio {
    url: string;
    timingFile: string | null;
}

/** Build a quick lookup from MediaManifest. */
export function buildAudioIndex(media: MediaManifest | undefined | null): Map<string, ChapterAudio> {
    const out = new Map<string, ChapterAudio>();
    if (!media?.audio?.items) return out;
    for (const a of media.audio.items as AudioEntry[]) {
        if (!a.url || !a.bookCode || !a.chapter) continue;
        out.set(`${a.bookCode}|${a.chapter}`, { url: a.url, timingFile: a.timingFile });
    }
    return out;
}

export function audioFor(
    index: Map<string, ChapterAudio>,
    bookCode: string,
    chapter: number
): ChapterAudio | null {
    return index.get(`${bookCode}|${chapter}`) ?? null;
}
