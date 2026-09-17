/**
 * Speculative early-start for a PKF language's full-Bible binary — call this
 * on tap/hover of a language link, BEFORE navigation completes, so the fetch
 * (and Proskomma thaw) is already in flight by the time the reader mounts.
 *
 * Why this matters: loadDocSet() (see ./store.ts) fetches the ENTIRE .pkf
 * binary for a language (all 66 books, no per-book split — e.g. Indonesian is
 * 3.5MB) in one request, and the reader's first chapter render explicitly
 * awaits it. That whole-Bible fetch+parse, not any catalog/config lookup, is
 * the dominant cost of "navigate to a new language" — this doesn't reduce
 * that cost, but starts paying it earlier, overlapping it with the page
 * navigation instead of happening entirely after.
 *
 * Safe to call speculatively and often: loadDocSet() dedupes by docSetId (an
 * already-loaded or in-flight language is a no-op), and Reader.svelte's own
 * ensurePkf() on mount will just see isLoaded() === true and skip re-fetching.
 */

import { hasPkf } from "../bw/language-list"
import { loadPkfInfo, pkfAssetsOf } from "../bw/pkf-info"
import { loadDocSet, isLoaded } from "./store"

const attempted = new Set<string>()

export function prefetchPkfText(iso: string): void {
  if (!iso || attempted.has(iso) || !hasPkf(iso)) return
  attempted.add(iso)

  loadPkfInfo(iso)
    .then((info) => {
      const assets = pkfAssetsOf(iso, info)
      if (!assets || isLoaded(assets.docSetId)) return
      return loadDocSet(assets.docSetId, assets.pkfUrl)
    })
    .catch(() => {
      // Speculative — a failure here just means the reader's own load does
      // the work later, same as if this prefetch never ran.
      attempted.delete(iso)
    })
}
