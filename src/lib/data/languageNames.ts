import raw from './language-names.json';
import allLangsRaw from '../../../public/ALL-langs-compact.json';
import catalogRaw from '../../../public/language-names-catalog.json';
import { firstNamedEntry, nameFromCatalog, type LanguageNameCatalog } from '../bw/language-name-catalog';

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

// bcv-commons/bibles' canonical iso -> {name, vernacular} catalog
// (doc/language-names.md; see language-name-catalog.ts and
// scripts/fetch-data.mjs) — the actual DISPLAY NAME source now,
// replacing the layered names/allLangsNames merge below for that
// purpose. Not used for `.d`/`.s` (script/direction): that file is
// deliberately scoped to names only, so RTL detection (nameFor, still
// consumed by Reader.svelte/ParallelView.svelte) keeps reading the older
// two-tier merge, which is the only place those fields exist at all.
const nameCatalog = catalogRaw as unknown as LanguageNameCatalog;

/**
 * `.d`/`.s` (script/text-direction) source: the full ~2137-language
 * catalog (public/ALL-langs-compact.json), behind the smaller curated
 * list (~137 entries). Kept only for these two fields — see nameCatalog
 * above for actual display names.
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

/** `.d`/`.s` (script/text-direction) lookup only — see the module comment
 *  above for why this doesn't also drive display names anymore. */
export function nameFor(iso: string): LanguageNameEntry | undefined {
    return firstNamedEntry(iso, [names, allLangsNames]);
}

/**
 * Primary display name — vernacular preferred, English as fallback, raw ISO
 * as last resort.
 */
export function displayName(iso: string): string {
    const e = nameFromCatalog(nameCatalog, iso);
    return e?.v ?? e?.n ?? iso;
}

/**
 * The "other" name — shown as a subtitle beneath the primary.
 * Returns undefined when only one of n/v is available.
 */
export function altName(iso: string): string | undefined {
    const e = nameFromCatalog(nameCatalog, iso);
    if (!e) return undefined;
    return e.v !== e.n ? e.n : undefined;
}
