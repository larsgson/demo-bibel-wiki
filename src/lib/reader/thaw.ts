import { decompressSync, strFromU8 } from 'fflate';
import type { SABProskomma } from './sab-proskomma';

/**
 * Load a Scripture App Builder .pkf archive into a Proskomma instance.
 * Port of example/sab-pwa/src/lib/scripts/thaw.ts.
 */
export function thaw(pk: SABProskomma, frozen: Uint8Array): void {
    const decompressed = decompressSync(frozen);
    const json = JSON.parse(strFromU8(decompressed));
    pk.loadSuccinctDocSet(json);
}
