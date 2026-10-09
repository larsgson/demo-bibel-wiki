/**
 * Reader-level user preferences: font size, line height and content-visibility
 * toggles. Persisted to localStorage so they survive reloads but are never
 * required — the defaults are safe for SSR.
 */
import { writable, type Writable } from 'svelte/store';
const browser = typeof window !== "undefined";

export type ReaderSettings = {
    /** Scripture-body font size in pixels; overrides the per-language
     *  delta.css default. */
    fontSize: number;
    /** Scripture-body line height as a unitless multiplier. */
    lineHeight: number;
    /** When false, figure grafts in the Sofria render are suppressed. */
    showIllustrations: boolean;
    /** When false, video tabs and inline video thumbnails are suppressed. */
    showVideos: boolean;
};

const DEFAULTS: ReaderSettings = {
    fontSize: 20,
    lineHeight: 1.6,
    showIllustrations: true,
    showVideos: true
};

const STORAGE_KEY = 'bw-reader-settings';

function loadInitial(): ReaderSettings {
    if (!browser) return DEFAULTS;
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return DEFAULTS;
        // Drop the removed `theme` setting from older stored values.
        const { theme: _theme, ...parsed } = JSON.parse(raw);
        return { ...DEFAULTS, ...parsed };
    } catch {
        return DEFAULTS;
    }
}

export const settings: Writable<ReaderSettings> = writable(loadInitial());

if (browser) {
    settings.subscribe((s) => {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
        } catch {
            /* quota / private mode — ignore */
        }
    });
}
