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
