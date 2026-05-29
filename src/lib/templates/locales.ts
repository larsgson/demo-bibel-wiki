import { parse as parseToml } from 'smol-toml';
import type { LocaleMap } from './types';

/**
 * Locales for the three templates are loaded eagerly via Vite glob —
 * combined size is small (Spanish + English for OBS/John/TGS ≈ ~50 KB).
 * Lazy fetching would just add a network round-trip per template.
 */
const localeFiles = import.meta.glob<string>(
    './content/*/locales/*.toml',
    { query: '?raw', import: 'default', eager: true }
);

const cache = new Map<string, LocaleMap>();

/**
 * Flatten any nested TOML object into dotted-key → string entries:
 *   { "01": { "01": { title: "x" } } }  →  { "01.01.title": "x" }
 */
function flatten(obj: unknown, prefix = '', out: LocaleMap = {}): LocaleMap {
    if (!obj || typeof obj !== 'object') return out;
    for (const [k, v] of Object.entries(obj)) {
        const key = prefix ? `${prefix}.${k}` : k;
        if (typeof v === 'string') out[key] = v;
        else if (v && typeof v === 'object') flatten(v, key, out);
    }
    return out;
}

/**
 * Load a template's locale strings, flattened to a dotted-key map.
 * Falls back: requestedLang → 'spa' → 'eng'. Returns an empty map if
 * none are found (the markdown parser then leaves [[t:...]] tokens
 * literally, which is uglier than a Spanish fallback).
 */
export function loadLocale(template: string, lang: string): LocaleMap {
    const cacheKey = `${template}|${lang}`;
    const cached = cache.get(cacheKey);
    if (cached) return cached;

    const candidates = [lang, 'spa', 'eng'];
    for (const code of candidates) {
        const path = `./content/${template}/locales/${code}.toml`;
        const raw = localeFiles[path];
        if (!raw) continue;
        try {
            const parsed = parseToml(raw);
            const flat = flatten(parsed);
            cache.set(cacheKey, flat);
            return flat;
        } catch {
            // Bad TOML — skip and try next fallback.
        }
    }
    const empty: LocaleMap = {};
    cache.set(cacheKey, empty);
    return empty;
}

/** List of locale codes available for a template. */
export function availableLocales(template: string): string[] {
    const out: string[] = [];
    const prefix = `./content/${template}/locales/`;
    for (const path of Object.keys(localeFiles)) {
        if (!path.startsWith(prefix)) continue;
        const code = path.slice(prefix.length).replace(/\.toml$/, '');
        out.push(code);
    }
    return out.sort();
}

/** Look up a key in the locale map; returns null when absent. */
export function localeLookup(map: LocaleMap, key: string): string | null {
    return map[key] ?? null;
}
