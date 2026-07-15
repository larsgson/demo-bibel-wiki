/**
 * Reader-level user preferences: theme, font size, and content-visibility
 * toggles. Persisted to localStorage so they survive reloads but are never
 * required — the defaults are safe for SSR.
 */
import { writable, type Writable } from 'svelte/store';
const browser = typeof window !== "undefined";

/** Theme ids match the CDN contract's `themeNames` (app-config §6.6). */
export type Theme = 'Normal' | 'Sepia' | 'Dark';

/** Migrate legacy stored values (light/sepia/dark) to the contract ids. */
const LEGACY_THEME: Record<string, Theme> = {
    light: 'Normal', sepia: 'Sepia', dark: 'Dark',
    Normal: 'Normal', Sepia: 'Sepia', Dark: 'Dark',
};

export type ReaderSettings = {
    theme: Theme;
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
    theme: 'Normal',
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
        const parsed = JSON.parse(raw);
        const merged = { ...DEFAULTS, ...parsed };
        merged.theme = LEGACY_THEME[merged.theme] ?? 'Normal';
        return merged;
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
