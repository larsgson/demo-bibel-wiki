import { writable, get } from 'svelte/store';
import { CHANGE_DOC_URL } from './changeIndicator';

/**
 * Edited-content overlay: a single Pankosmia ingredient surfaces structured
 * OBS-style markdown that we can use as a last-resort verse text when an
 * iso's local pkf doesn't cover an OT OBS story section.
 *
 *   - Images in the edited content are matched by filename to OBS section
 *     images (the OBS local .md uses bare filenames like `obs-en-01-01.jpg`).
 *   - Each click on the green change indicator bumps `editedContentVersion`
 *     so consumers can re-parse without refreshing the page.
 *   - Only applied to OBS templates' OT-canon categories. Empty / missing
 *     text in the iso's pkf is the precondition for the overlay to kick in.
 */

/** Store consumers subscribe to in $effect for re-parse triggers. */
export const editedContentVersion = writable(0);

/** Call this to force every consumer to re-fetch + re-parse. */
export function bumpEditedContent(): void {
    editedContentVersion.update((v) => v + 1);
}

let cachedMap: Map<string, string> = new Map();
let cachedVersion = -1;
let inflight: Promise<Map<string, string>> | null = null;

/** Fetch + parse the edited markdown. Cached per `editedContentVersion`. */
export async function getEditedObsMap(): Promise<Map<string, string>> {
    const version = get(editedContentVersion);
    if (cachedVersion === version) return cachedMap;
    if (inflight) return inflight;

    inflight = (async () => {
        try {
            const r = await fetch(CHANGE_DOC_URL, { cache: 'no-cache' });
            if (r.status >= 500 || !r.ok) {
                // The server emits a deterministic 4xx body when the file
                // is missing — don't treat that as a fatal error, just
                // produce an empty map. 5xx / network errors → empty map.
                cachedMap = r.status >= 500 ? new Map() : parseEditedObs(await r.text());
            } else {
                cachedMap = parseEditedObs(await r.text());
            }
            cachedVersion = version;
        } catch {
            cachedMap = new Map();
            cachedVersion = version;
        }
        return cachedMap;
    })();
    try {
        return await inflight;
    } finally {
        inflight = null;
    }
}

/**
 * Parse Pankosmia's edited markdown into a map of
 *   `<image filename> → <verse text following that image>`.
 *
 * Format observed:
 *
 *   # 1. The Creation
 *
 *   ![OBS Image](https://cdn.door43.org/obs/jpg/360px/obs-en-01-01.jpg)
 *
 *   God create the heavens and the earth.
 *
 *   ![OBS Image](https://.../obs-en-01-02.jpg)
 *
 *   …
 *
 * Lines that start with `#` are titles → skipped. `![…](url)` lines start a
 * new image-text section keyed by the URL's basename. All non-empty text
 * lines until the next image are collected into that section's text.
 * Empty section text (the editor hasn't filled it yet) is stored as `''`
 * so consumers can distinguish "no override available" from "explicit
 * empty override".
 */
export function parseEditedObs(md: string): Map<string, string> {
    const out = new Map<string, string>();
    if (!md) return out;

    let currentFilename: string | null = null;
    const buf: string[] = [];

    function commit() {
        if (currentFilename) {
            const text = buf.join(' ').replace(/\s+/g, ' ').trim();
            out.set(currentFilename, text);
        }
        buf.length = 0;
    }

    for (const rawLine of md.split('\n')) {
        const line = rawLine.trim();
        if (!line) continue;
        if (line.startsWith('#')) continue;
        const img = line.match(/!\[.*?\]\((.+?)\)/);
        if (img) {
            commit();
            currentFilename = img[1].split('/').pop() ?? null;
            continue;
        }
        if (currentFilename) buf.push(line);
    }
    commit();
    return out;
}
