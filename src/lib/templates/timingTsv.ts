import type { TimingEntry, ParsedReference } from './types';

/**
 * Scripture-Earth timing files are per-chapter TSV:
 *
 *   <start_seconds>\t<end_seconds>\t<verseId>
 *
 * verseId is mostly a plain integer, but can include a letter suffix
 * (1a / 1b / 1c) for sub-verse splits. We collapse sub-verses into a
 * single integer-keyed range, taking min(start) and max(end) so that
 * "play verse 1" plays everything tagged 1, 1a, 1b, …
 */

export interface ParsedTiming {
    /** Map of verse-number → { start, end } in seconds. */
    byVerse: Map<number, { start: number; end: number }>;
    /** Raw entries in file order, for debugging or richer ranges. */
    entries: TimingEntry[];
}

export function parseSeTimingTsv(text: string): ParsedTiming {
    const byVerse = new Map<number, { start: number; end: number }>();
    const entries: TimingEntry[] = [];

    for (const rawLine of text.split('\n')) {
        const line = rawLine.trim();
        if (!line || line.startsWith('#')) continue;
        const parts = line.split(/\t+/);
        if (parts.length < 3) continue;
        const start = parseFloat(parts[0]);
        const end = parseFloat(parts[1]);
        const verseId = parts[2];
        if (!Number.isFinite(start) || !Number.isFinite(end) || !verseId) continue;

        entries.push({ start, end, verseId });
        const num = parseInt(verseId, 10);
        if (!Number.isFinite(num)) continue;

        const prev = byVerse.get(num);
        if (prev) {
            byVerse.set(num, {
                start: Math.min(prev.start, start),
                end: Math.max(prev.end, end)
            });
        } else {
            byVerse.set(num, { start, end });
        }
    }
    return { byVerse, entries };
}

/** Given a parsed reference, return the audio range that covers it,
 *  or null if no covered verse is in the timing data. */
export function rangeForReference(
    timing: ParsedTiming,
    ref: ParsedReference
): { start: number; end: number } | null {
    const targets: number[] = ref.verses
        ? ref.verses
        : Array.from(
              { length: (ref.verseEnd ?? ref.verseStart ?? 0) - (ref.verseStart ?? 0) + 1 },
              (_, i) => (ref.verseStart ?? 0) + i
          );

    let start = Number.POSITIVE_INFINITY;
    let end = Number.NEGATIVE_INFINITY;
    let found = false;
    for (const v of targets) {
        const r = timing.byVerse.get(v);
        if (!r) continue;
        found = true;
        if (r.start < start) start = r.start;
        if (r.end > end) end = r.end;
    }
    return found ? { start, end } : null;
}

const cache = new Map<string, ParsedTiming | null>();

/** Fetch + cache a per-chapter timing file. Returns null on any failure
 *  (404, CORS, parse error). */
export async function loadTiming(timingUrl: string): Promise<ParsedTiming | null> {
    const cached = cache.get(timingUrl);
    if (cached !== undefined) return cached;
    try {
        const r = await fetch(timingUrl);
        if (!r.ok) {
            cache.set(timingUrl, null);
            return null;
        }
        const text = await r.text();
        const parsed = parseSeTimingTsv(text);
        cache.set(timingUrl, parsed);
        return parsed;
    } catch {
        cache.set(timingUrl, null);
        return null;
    }
}
