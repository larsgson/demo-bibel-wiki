/**
 * Shared bookmark helpers for the left-nav sidebars. Reader.svelte owns the
 * actual toggle (it has book/chapter state already) and is the only writer;
 * these read the same localStorage keys Reader.svelte writes so the
 * sidebars can show/react to the current chapter's bookmark state without
 * needing their own copy of Reader.svelte's reactive state.
 *
 * Cross-component sync: Reader.svelte dispatches `bookmark-state-changed`
 * after every toggle and `bible-position-changed` after every chapter
 * navigation (already existed for other consumers) — callers should
 * re-derive on both.
 */

const BOOKMARKS_KEY = 'bw-bookmarks';
const POSITION_KEY = 'bw-last-position';

export function currentBookmarkKey(iso: string): string | null {
    try {
        const raw = localStorage.getItem(POSITION_KEY);
        if (!raw) return null;
        const pos = JSON.parse(raw);
        if (typeof pos?.book !== 'string' || typeof pos?.chapter !== 'number') return null;
        return `${iso}/${pos.book}/${pos.chapter}`;
    } catch {
        return null;
    }
}

export function isBookmarked(key: string | null): boolean {
    if (!key) return false;
    try {
        const raw = localStorage.getItem(BOOKMARKS_KEY);
        if (!raw) return false;
        const keys: string[] = JSON.parse(raw);
        return keys.includes(key);
    } catch {
        return false;
    }
}
