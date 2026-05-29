import raw from './language-names.json';

export type LanguageNameEntry = {
    /** English name (from ALL-langs-compact.json). */
    n?: string;
    /** Vernacular or native name (preferred for display). */
    v?: string;
    /** Text direction (present for RTL languages). */
    d?: 'rtl';
    /** Writing script. */
    s?: string;
};

const names = (raw as { names: Record<string, LanguageNameEntry> }).names;

export function nameFor(iso: string): LanguageNameEntry | undefined {
    return names[iso];
}

/**
 * Primary display name — vernacular preferred, English as fallback, raw ISO
 * as last resort.
 */
export function displayName(iso: string): string {
    const e = names[iso];
    return e?.v ?? e?.n ?? iso;
}

/**
 * The "other" name — shown as a subtitle beneath the primary.
 * Returns undefined when only one of n/v is available.
 */
export function altName(iso: string): string | undefined {
    const e = names[iso];
    if (!e) return undefined;
    if (e.v && e.n) return e.n;
    return undefined;
}
