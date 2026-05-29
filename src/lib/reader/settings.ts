/**
 * Reader-level user preferences: theme, font size, and content-visibility
 * toggles. Persisted to localStorage so they survive reloads but are never
 * required — the defaults are safe for SSR.
 */
import { writable, type Writable } from 'svelte/store';
const browser = typeof window !== "undefined";

export type Theme = 'light' | 'sepia' | 'dark';

export type ReaderSettings = {
    theme: Theme;
    /** Scripture-body font size in pixels; overrides the per-language
     *  delta.css default. */
    fontSize: number;
    /** When false, figure grafts in the Sofria render are suppressed. */
    showIllustrations: boolean;
    /** When false, video tabs and inline video thumbnails are suppressed. */
    showVideos: boolean;
};

const DEFAULTS: ReaderSettings = {
    theme: 'light',
    fontSize: 20,
    showIllustrations: true,
    showVideos: true
};

const STORAGE_KEY = 'bw-reader-settings';

function loadInitial(): ReaderSettings {
    if (!browser) return DEFAULTS;
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return DEFAULTS;
        const parsed = JSON.parse(raw);
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
