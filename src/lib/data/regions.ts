import regionsRaw from '../../../config/regions.conf?raw';
import manifest from '../../../data/pkf/manifest.json';
import licenses from '../../../config/licenses.json';

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

function toSlug(s: string): string {
    return s
        .toLowerCase()
        .replace(/[()]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '');
}

function stripMexicoPrefix(name: string): string {
    const m = name.match(/^Mexico:\s*(.+)$/);
    return m ? m[1] : name;
}

function parseMexicoRegions(raw: string): Region[] {
    const blocks = raw.split(/\n\s*\n/);
    const out: Region[] = [];
    for (const block of blocks) {
        const lines = block
            .split('\n')
            .map((l) => l.trim())
            .filter((l) => l && !l.startsWith('#'));
        if (lines.length === 0) continue;
        const name = lines[0];
        if (!name.startsWith('Mexico:')) continue;

        let trade: string[] = [];
        let regional: string[] = [];
        const isos: string[] = [];
        for (const line of lines.slice(1)) {
            if (line.startsWith('@trade:')) {
                trade = line
                    .slice('@trade:'.length)
                    .split(',')
                    .map((s) => s.trim())
                    .filter(Boolean);
            } else if (line.startsWith('@regional:')) {
                regional = line
                    .slice('@regional:'.length)
                    .split(',')
                    .map((s) => s.trim())
                    .filter(Boolean);
            } else if (line.startsWith('@')) {
                // other optional attrs (educational, literacy) ignored for now
            } else {
                isos.push(
                    ...line
                        .split(',')
                        .map((s) => s.trim())
                        .filter((s) => s && !excludedIsos.has(s))
                );
            }
        }
        const uniqIsos = Array.from(new Set(isos)).sort();
        const available = uniqIsos.filter((iso) => languagesByIso.has(iso));
        const display = stripMexicoPrefix(name);
        out.push({
            id: toSlug(display),
            displayName: display,
            fullName: name,
            trade,
            regional,
            isos: uniqIsos,
            available
        });
    }
    return out;
}

const mexicoRegions = parseMexicoRegions(regionsRaw);

// Any fetched ISO not in a Mexico region goes into Unclassified, so nothing is hidden.
// This assumes all fetched pkfs are Mexican (as per the current --country MX run).
const classifiedInMexico = new Set<string>();
for (const r of mexicoRegions) for (const iso of r.isos) classifiedInMexico.add(iso);
const unclassifiedIsos = languages
    .map((l) => l.iso)
    .filter((iso) => !classifiedInMexico.has(iso))
    .sort();

if (unclassifiedIsos.length > 0) {
    mexicoRegions.push({
        id: 'unclassified',
        displayName: 'Unclassified',
        fullName: 'Mexico: Unclassified (not yet in config/regions.conf)',
        trade: [],
        regional: [],
        isos: unclassifiedIsos,
        available: unclassifiedIsos
    });
}

export const regions: Region[] = mexicoRegions;
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
