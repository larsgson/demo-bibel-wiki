import manifest from '../../../data/pkf/manifest.json';
import licenses from '../../../config/licenses.json';
import sourceCatalog from '../../../data/source-catalog.json';
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

// manifest.json's `languages` field has shifted shape at least once already
// (array of {iso, pkfs, catalogs, ...} → dict keyed by iso, each entry with a
// `collections[]` array — the CDN's newer, multi-collection-aware format).
// Normalize whichever shape is on disk into the flat Language[] the rest of
// the app expects, so a future CDN reshape degrades gracefully instead of
// breaking the build.
type ManifestCollection = { pkf?: string; catalog?: string; pkf_bytes?: number };
type ManifestLangEntryV2 = { collections?: ManifestCollection[] };

function normalizeManifestLanguages(raw: unknown): Language[] {
    if (Array.isArray(raw)) {
        // v1 shape: already Language[].
        return (raw as Language[]).slice();
    }
    // v2 shape: dict keyed by iso, per-language collections[].
    return Object.entries(raw as Record<string, ManifestLangEntryV2>).map(([iso, entry]) => {
        const collections = entry.collections ?? [];
        return {
            iso,
            version: null,
            pkfs: collections.map((c) => c.pkf).filter((x): x is string => !!x),
            catalogs: collections.map((c) => c.catalog).filter((x): x is string => !!x),
            pkf_bytes: collections.reduce((sum, c) => sum + (c.pkf_bytes ?? 0), 0),
        };
    });
}

export const languages: Language[] = normalizeManifestLanguages(manifest.languages).sort((a, b) =>
    a.iso.localeCompare(b.iso)
);

export const languagesByIso = new Map<string, Language>(languages.map((l) => [l.iso, l]));

// ISOs with a build-time-resolved text source (data/source-catalog.json —
// see scripts/fetch-data.mjs and src/lib/bw/source-catalog.ts) that ISN'T
// PKF: helloAO or DBT. "available" below used to mean "has PKF data" only,
// which was accurate back when PKF was the only reader source — regions
// built entirely from non-PKF content (e.g. config/regions/ke.toml, whose
// languages are deliberately PKF+helloAO+DBT) showed 0 available languages
// on the landing page despite Reader.svelte being able to read most of them.
const catalogedIsos = new Set(Object.keys(sourceCatalog));

// Build the region list from the per-region TOML configs (config/regions/*.toml).
// Each config is a top-level region (country). License-excluded ISOs are dropped
// from the displayed membership so they don't appear in the UI grid.
const builtRegions: Region[] = regionConfigs.map((rc) => {
    const isos = Array.from(new Set(rc.languages))
        .filter((iso) => !excludedIsos.has(iso))
        .sort();
    const available = isos.filter((iso) => languagesByIso.has(iso) || catalogedIsos.has(iso));
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
