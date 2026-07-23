import raw from './language-names.json';
import allLangsRaw from '../../../public/ALL-langs-compact.json';

export type LanguageNameEntry = {
    /** English name (from ALL-langs-compact.json). */
    n?: string;
    /** Vernacular or native name (preferred for display). */
    v?: string;
    /** Text direction (present for RTL languages) — 'rtl' in the curated
     *  list, but ALL-langs-compact.json sometimes has one per script. */
    d?: string | string[];
    /** Writing script(s). */
    s?: string | string[];
};

const names = (raw as { names: Record<string, LanguageNameEntry> }).names;

/**
 * Fallback tier: the full ~2137-language catalog (public/ALL-langs-compact.json).
 * `names` above is a smaller, curated list (~137 entries, effectively just the
 * PKF-covered languages) — any language outside that set (e.g. most of a
 * DBT-only region like config/regions/ke.toml's) has no entry there at all,
 * which used to mean displayName() fell straight through to the raw ISO
 * code. The source of a language's *content* (PKF vs DBT vs helloAO)
 * shouldn't affect whether its *name* displays properly, so this merges in
 * every language ALL-langs-compact.json knows about as a second tier before
 * finally giving up and showing the ISO code.
 */
const allLangsCanons = (
    allLangsRaw as unknown as { canons: Record<string, Record<string, Record<string, LanguageNameEntry>>> }
).canons;
const allLangsNames: Record<string, LanguageNameEntry> = {};
for (const cats of Object.values(allLangsCanons)) {
    for (const entries of Object.values(cats)) {
        for (const [iso, info] of Object.entries(entries)) {
            if (!(iso in allLangsNames)) allLangsNames[iso] = info;
        }
    }
}

export function nameFor(iso: string): LanguageNameEntry | undefined {
    return names[iso] ?? allLangsNames[iso];
}

/**
 * Primary display name — vernacular preferred, English as fallback, raw ISO
 * as last resort.
 */
export function displayName(iso: string): string {
    const e = nameFor(iso);
    return e?.v ?? e?.n ?? iso;
}

/**
 * The "other" name — shown as a subtitle beneath the primary.
 * Returns undefined when only one of n/v is available.
 */
export function altName(iso: string): string | undefined {
    const e = nameFor(iso);
    if (!e) return undefined;
    if (e.v && e.n) return e.n;
    return undefined;
}
