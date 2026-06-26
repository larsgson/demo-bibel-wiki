import manifest from '../../../data/pkf/manifest.json';
import licenses from '../../../config/licenses.json';
import { regionConfigs } from './region-config';

// ISOs explicitly excluded from the public data release (non-CC content).
// Dropped from regions.conf parsing so they don't appear in the UI — neither
// in the language grid nor in the "listed without data" disclosure.
const excludedIsos = new Set<string>(Object.keys(licenses.excluded ?? {}));

export type Language = {
    iso: string;
    version: string | null;
    pkfs: string[];
    catalogs: string[];
    /** Total size in bytes of this language's .pkf assets. Present when the
     * manifest was written by a recent fetch_pkf.py; 0 otherwise. */
    pkf_bytes?: number;
    /** Non-pkf data type (e.g. 'bsb' for the Berean Standard Bible). */
    type?: string;
};

export type Region = {
    id: string;
    displayName: string;
    fullName: string;
    trade: string[];
    regional: string[];
    isos: string[];
    available: string[];
};

export const languages: Language[] = (manifest.languages as Language[]).slice().sort((a, b) =>
    a.iso.localeCompare(b.iso)
);

export const languagesByIso = new Map<string, Language>(languages.map((l) => [l.iso, l]));

// Build the region list from the per-region TOML configs (config/regions/*.toml).
// Each config is a top-level region (country). License-excluded ISOs are dropped
// from the displayed membership so they don't appear in the UI grid.
const builtRegions: Region[] = regionConfigs.map((rc) => {
    const isos = Array.from(new Set(rc.languages))
        .filter((iso) => !excludedIsos.has(iso))
        .sort();
    const available = isos.filter((iso) => languagesByIso.has(iso));
    return {
        id: rc.code,
        displayName: rc.name.es ?? rc.name.en ?? rc.code,
        fullName: rc.name.en ?? rc.code,
        trade: rc.tradeLanguages ?? [],
        regional: rc.featuredLanguages ?? [],
        isos,
        available,
    };
});

export const regions: Region[] = builtRegions;
export const regionsById = new Map<string, Region>(regions.map((r) => [r.id, r]));

/** Bytes of a language's pkf assets, read from the manifest (no info.json
 *  load required). Falls back to 0 when the manifest predates the pkf_bytes
 *  field — re-run fetch_pkf.py (or the backfill script) to populate it. */
export function pkfSizeBytes(iso: string): number {
    return languagesByIso.get(iso)?.pkf_bytes ?? 0;
}

/** First region that contains this ISO. Returns undefined for an unknown ISO. */
export function regionForIso(iso: string): Region | undefined {
    for (const r of regions) {
        if (r.isos.includes(iso)) return r;
    }
    return undefined;
}
