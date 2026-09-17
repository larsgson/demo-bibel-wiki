import { SABProskomma } from './sab-proskomma';
import { thaw } from './thaw';

let _pk: SABProskomma | null = null;
const _loaded = new Set<string>();
const _inflight = new Map<string, Promise<void>>();

function instance(): SABProskomma {
    if (!_pk) _pk = new SABProskomma();
    return _pk;
}

async function doLoad(docSetId: string, pkfUrl: string): Promise<void> {
    const res = await fetch(pkfUrl);
    if (!res.ok) throw new Error(`fetch ${pkfUrl}: ${res.status}`);
    const buf = new Uint8Array(await res.arrayBuffer());
    thaw(instance(), buf);
    _loaded.add(docSetId);
}

export function getProskomma(): SABProskomma {
    return instance();
}

export function isLoaded(docSetId: string): boolean {
    return _loaded.has(docSetId);
}

export function loadDocSet(docSetId: string, pkfUrl: string): Promise<void> {
    if (_loaded.has(docSetId)) return Promise.resolve();
    let p = _inflight.get(docSetId);
    if (!p) {
        p = doLoad(docSetId, pkfUrl).finally(() => _inflight.delete(docSetId));
        _inflight.set(docSetId, p);
    }
    return p;
}

// ── Live USX import (dbt-usx.ts) ─────────────────────────────────────────
//
// Unlike loadDocSet's whole-language .pkf snapshot (thawed in one shot,
// every book already present), a DBT USX fileset delivers one file PER
// BOOK — so this tracks import per (docSetId, bookCode) instead of just
// docSetId. Proskomma's own importDocument() throws if a bookCode is
// imported twice into the same docSet, so callers MUST check
// isUsxBookLoaded first.

const _usxLoadedBooks = new Set<string>();

/** Proskomma derives docSetId from the selectors itself (values joined by
 *  "_", in selector-array order — lang then abbr for SABProskomma) — never
 *  pass/assume a docSetId separately from the selectors that produced it,
 *  or the two can silently drift apart. */
export function usxDocSetId(selectors: Record<string, string>): string {
    return `${selectors.lang}_${selectors.abbr}`;
}

function usxBookKey(docSetId: string, bookCode: string): string {
    return `${docSetId}:${bookCode}`;
}

export function isUsxBookLoaded(docSetId: string, bookCode: string): boolean {
    return _usxLoadedBooks.has(usxBookKey(docSetId, bookCode));
}

/** Synchronous — the caller already has the USX content in hand (fetching
 *  it is dbt-usx.ts's job). Throws if this exact (docSetId, bookCode) was
 *  already imported — check isUsxBookLoaded first. Returns the docSetId
 *  Proskomma actually used (see usxDocSetId), so callers never have to
 *  recompute/duplicate that derivation themselves. */
export function importUsxBook(
    selectors: Record<string, string>,
    bookCode: string,
    usxContent: string,
): string {
    instance().importDocument(selectors, 'usx', usxContent);
    const docSetId = usxDocSetId(selectors);
    _usxLoadedBooks.add(usxBookKey(docSetId, bookCode));
    return docSetId;
}
