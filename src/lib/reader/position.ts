const browser = typeof window !== "undefined";

export type LastPosition = { book: string; chapter: number };

const KEY = 'bw-last-position';
const DEFAULT: LastPosition = { book: 'MAT', chapter: 1 };

const ISO_KEY = 'bw-last-iso';
/**
 * Session flag written by the header/breadcrumb when the user explicitly
 * navigates to "/" — disables the one-shot redirect so they actually land on
 * the home page instead of bouncing back to their last language.
 */
const HOME_OVERRIDE_KEY = 'bw-home-override';

export function loadLastIso(): string | null {
    if (!browser) return null;
    try {
        return localStorage.getItem(ISO_KEY) || null;
    } catch {
        return null;
    }
}

export function saveLastIso(iso: string): void {
    if (!browser) return;
    try {
        localStorage.setItem(ISO_KEY, iso);
    } catch {
        /* silent */
    }
}

/**
 * Clear the remembered last-used language. Called when the user navigates
 * away via the breadcrumb (Mexico / region anchor) — the intent there is
 * "leave this language", so the home page should NOT auto-resume back to it.
 */
export function forgetLastIso(): void {
    if (!browser) return;
    try {
        localStorage.removeItem(ISO_KEY);
    } catch {
        /* silent */
    }
}

/** Call before navigating to "/" to ask the home page not to redirect. */
export function requestHomeOverride(): void {
    if (!browser) return;
    try {
        sessionStorage.setItem(HOME_OVERRIDE_KEY, '1');
    } catch {
        /* silent */
    }
}

/** Consumed once by the home page; returns true and clears the flag. */
export function consumeHomeOverride(): boolean {
    if (!browser) return false;
    try {
        const v = sessionStorage.getItem(HOME_OVERRIDE_KEY);
        if (v) sessionStorage.removeItem(HOME_OVERRIDE_KEY);
        return v === '1';
    } catch {
        return false;
    }
}

const GREETING_SEEN_KEY = 'bw-greeting-seen';

export function loadGreetingSeen(): boolean {
    if (!browser) return true; // hide during SSR/prerender to avoid flash
    try {
        return localStorage.getItem(GREETING_SEEN_KEY) === '1';
    } catch {
        return false;
    }
}

export function markGreetingSeen(): void {
    if (!browser) return;
    try {
        localStorage.setItem(GREETING_SEEN_KEY, '1');
    } catch {
        /* silent */
    }
}

const GREETING_BACK_SHOWN_KEY = 'bw-greeting-back-shown';

/** Whether the "← Ver introducción" hint pill has already been shown once.
 *  One-shot: the pill appears the very first time a user dismisses the
 *  greeting, so they know they can return; after that, the footer link is
 *  the long-term access. */
export function loadGreetingBackShown(): boolean {
    if (!browser) return true; // default-hide during SSR
    try {
        return localStorage.getItem(GREETING_BACK_SHOWN_KEY) === '1';
    } catch {
        return false;
    }
}

export function markGreetingBackShown(): void {
    if (!browser) return;
    try {
        localStorage.setItem(GREETING_BACK_SHOWN_KEY, '1');
    } catch {
        /* silent */
    }
}

/** Whether a position was ever actually saved (vs. `loadLastPosition()`
 *  falling back to its hardcoded default) — lets a first-ever visit prefer
 *  the language's own `start-at-reference` over Matthew 1. */
export function hasLastPosition(): boolean {
    if (!browser) return false;
    try {
        return !!localStorage.getItem(KEY);
    } catch {
        return false;
    }
}

/**
 * Global last-read position — book + chapter, shared across ALL languages.
 * Persists to localStorage; consumers should apply a per-catalog fallback
 * (see `resolvePosition`) in case the current language doesn't have the
 * remembered book.
 */
export function loadLastPosition(): LastPosition {
    if (!browser) return DEFAULT;
    try {
        const raw = localStorage.getItem(KEY);
        if (!raw) return DEFAULT;
        const parsed = JSON.parse(raw) as Partial<LastPosition>;
        if (typeof parsed?.book === 'string' && typeof parsed?.chapter === 'number') {
            return { book: parsed.book, chapter: parsed.chapter };
        }
    } catch {
        /* ignore corrupt value */
    }
    return DEFAULT;
}

export function saveLastPosition(pos: LastPosition): void {
    if (!browser) return;
    try {
        localStorage.setItem(KEY, JSON.stringify(pos));
    } catch {
        /* quota / disabled storage — silent */
    }
}

/**
 * Given a desired position and the set of available books/chapter counts in
 * this language, return the position to actually open.
 *
 * Fallback order:
 *   1. Remembered book + chapter (clamped to its chapter count)
 *   2. Matthew (MAT) chapter 1
 *   3. First book / chapter 1 (if the language has no MAT at all)
 *   4. null (no readable content)
 */
export function resolvePosition(
    want: LastPosition,
    available: Array<{ bookCode: string; chapters: number }>
): LastPosition | null {
    if (available.length === 0) return null;
    const byCode = new Map(available.map((b) => [b.bookCode, b]));

    const wanted = byCode.get(want.book);
    if (wanted && wanted.chapters > 0) {
        const ch = Math.min(Math.max(want.chapter, 1), wanted.chapters);
        return { book: want.book, chapter: ch };
    }
    const mat = byCode.get('MAT');
    if (mat && mat.chapters > 0) return { book: 'MAT', chapter: 1 };
    const first = available.find((b) => b.chapters > 0);
    return first ? { book: first.bookCode, chapter: 1 } : null;
}
