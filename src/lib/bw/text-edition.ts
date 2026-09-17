import { parseTextFilesetId } from "./fileset-utils"
import { pkfUrl } from "./pkf-url"
import { loadPkfInfo, pkfAssetsOf, type PkfAssets } from "./pkf-info"
import {
  loadLanguageMedia,
  preferredFilesetId,
  orderedByPreference,
  loadHelloaoSource,
  type FilesetEntry,
  type CanonMedia,
} from "./dbt-media"
import { resolveTextSource, type ResolvedSource } from "./source-catalog"
import languagePreferences from "../../data/language-preferences.json"
import openbibleEditions from "../../data/openbible-editions.json"

/**
 * THE single per-canon text-edition resolver — mirrors dbt-media.ts's
 * resolveChapterAudioUrl exactly (same inputs: language-preferences.json,
 * media.json, source-catalog.json), but for deciding which TEXT edition to
 * read, replacing what used to be three independently-hardcoded answers
 * (ReaderLoader.tsx, chapter-store.ts, book-list.ts — see
 * internal-docs/unified-text-pipeline.md for the full before/after).
 *
 * Confirmed precedence (explicit user decision, 2026-09-17):
 * explicit config > PKF > "paired" DBT text (the DBT fileset that also
 * carries this canon's real DBT audio, so text and narration stay one
 * edition) > everything else, in priority order pkf > helloao > dbt >
 * openbible.
 *
 * Split in two, deliberately: gatherInputs() does all the IO (each already
 * cached by its own module); rankTextEditions() is a pure, synchronous
 * function over the gathered plain data — directly unit-testable without
 * mocking five modules (see text-edition.test.ts).
 */

export type TextProvider = "pkf" | "helloao" | "dbt" | "openbible"

export interface TextEdition {
  provider: TextProvider
  /** helloAO translation id | DBT text-fileset id (canon letter already
   *  applied where needed) | openbible edition abbreviation | PKF docSetId. */
  id: string
  canon: "nt" | "ot"
  /** Which tier produced this candidate — for ?readerdebug tracing only. */
  via: string
  /** Only set for provider "pkf" — the asset bundle loadChapterDoc needs to
   *  actually fetch/query the docSet. */
  pkf?: PkfAssets
}

export function textFilesetIdFor(baseId: string, canon: "nt" | "ot"): string {
  return parseTextFilesetId(`${canon === "ot" ? "O" : "N"}_ET`, baseId)
}

// ── explicit config (tier 0) ─────────────────────────────────────────────

export interface PreferredTextConfig {
  source: "helloao" | "dbt" | "openbible"
  id: string
}

function preferredTextFor(iso: string, canon: "nt" | "ot"): PreferredTextConfig | null {
  const pref = (
    languagePreferences as Record<string, { preferredText?: PreferredTextConfig | Record<string, PreferredTextConfig> }>
  )[iso]?.preferredText
  if (!pref) return null
  if (typeof (pref as PreferredTextConfig).source === "string") return pref as PreferredTextConfig
  return (pref as Record<string, PreferredTextConfig>)[canon] ?? null
}

// ── verified-identical DBT<->helloAO twins (catalog/overlap.json) ───────────

export interface OverlapCluster {
  ids: string[]
  /** Present ONLY on an unverified "closest guess" singleton — see
   *  doc/catalog-overlap.md. A cluster with no `likely` field is a real,
   *  text-compared-identical group; one WITH it is not, and must never be
   *  treated as a same-edition twin. */
  likely?: string
}
export interface OverlapCatalog {
  entries: Record<string, OverlapCluster[]>
}

let overlapPromise: Promise<OverlapCatalog | null> | null = null

/** DBT's full cross-source comparison catalog (~170KB, all languages) —
 *  fetched lazily (only once a DBT text candidate is actually being ranked)
 *  and cached once per session. */
function loadOverlapCatalog(): Promise<OverlapCatalog | null> {
  if (overlapPromise) return overlapPromise
  overlapPromise = fetch(pkfUrl("/catalog/overlap.json"))
    .then((r) => (r.ok ? (r.json() as Promise<OverlapCatalog>) : null))
    .catch(() => null)
  return overlapPromise
}

/** A same-edition helloAO translation id, ONLY when catalog/overlap.json has
 *  a real, verified (no `likely`) cluster containing both `d:<baseId>` and
 *  an `h:` id — e.g. French's "FRNTLS" <-> "fra_lsg". Never guessed from a
 *  naming pattern (catalog-overlap.md's own "verified only" principle). */
export function findVerifiedTwin(
  overlap: OverlapCatalog | null,
  iso: string,
  canon: "nt" | "ot",
  baseId: string,
): string | null {
  const clusters = overlap?.entries?.[`${iso}:${canon}`]
  if (!clusters) return null
  for (const cluster of clusters) {
    if (cluster.likely) continue
    if (!cluster.ids.includes(`d:${baseId}`)) continue
    const h = cluster.ids.find((id) => id.startsWith("h:"))
    if (h) return h.slice(2)
  }
  return null
}

// ── pure ranking ─────────────────────────────────────────────────────────

export interface TextEditionInputs {
  iso: string
  canon: "nt" | "ot"
  preferredText: PreferredTextConfig | null
  preferred: string | null
  canonMedia: CanonMedia | null
  /** canonMedia.filesets, already reordered so `preferred` (if present) is
   *  first — see dbt-media.ts's orderedByPreference. */
  filesets: FilesetEntry[]
  pkfAssets: PkfAssets | null
  sourceCatalogSrc: ResolvedSource | null
  overlap: OverlapCatalog | null
  /** Only gathered when `preferred` is set AND absent from `filesets` —
   *  the "configured but not yet backfilled into media.json" case
   *  resolveChapterAudioUrl's own tier 0 sidecar fallback also handles. */
  preferredSidecarText: { source?: string; id?: string } | null
  openbibleEdition: string | null
}

/**
 * Every real candidate for (iso, canon), in priority order, deduplicated by
 * provider:id. Pure and synchronous — all IO already done by the caller
 * (gatherInputs, or a test's own hand-built inputs).
 */
export function rankTextEditions(inputs: TextEditionInputs): TextEdition[] {
  const {
    iso,
    canon,
    preferredText,
    preferred,
    canonMedia,
    filesets,
    pkfAssets,
    sourceCatalogSrc,
    overlap,
    preferredSidecarText,
    openbibleEdition,
  } = inputs

  const out: TextEdition[] = []
  const seen = new Set<string>()
  function add(ed: TextEdition | null) {
    if (!ed) return
    const key = `${ed.provider}:${ed.id}`
    if (seen.has(key)) return
    seen.add(key)
    out.push(ed)
  }
  function addDbt(baseId: string, via: string) {
    const twin = findVerifiedTwin(overlap, iso, canon, baseId)
    if (twin) add({ provider: "helloao", id: twin, canon, via: "dbt-twin" })
    add({ provider: "dbt", id: textFilesetIdFor(baseId, canon), canon, via })
  }

  // 0. Explicit text preference (language-preferences.json's preferredText).
  if (preferredText) {
    if (preferredText.source === "dbt") addDbt(preferredText.id, "preferred-text")
    else add({ provider: preferredText.source, id: preferredText.id, canon, via: "preferred-text" })
  }

  // 1. Preferred fileset (preferredFileset) — helloAO-backed inline
  //    textSource wins outright; else its own real DBT text id, when it has
  //    one (twin-checked like every other DBT candidate); else the sidecar,
  //    when the entry isn't in the catalog at all yet.
  if (preferred) {
    const preferredEntry = canonMedia?.filesets?.find((f) => f.id === preferred)
    if (preferredEntry?.textSource?.source === "helloao" && preferredEntry.textSource.id) {
      add({ provider: "helloao", id: preferredEntry.textSource.id, canon, via: "preferred-helloao" })
    } else if (!preferredEntry) {
      if (preferredSidecarText?.source === "helloao" && preferredSidecarText.id) {
        add({ provider: "helloao", id: preferredSidecarText.id, canon, via: "preferred-helloao-sidecar" })
      }
    } else if (preferredEntry.t && !preferredEntry.textSource) {
      addDbt(preferredEntry.id, "preferred-dbt")
    }
  }

  // 2. PKF.
  if (pkfAssets) {
    add({ provider: "pkf", id: pkfAssets.docSetId, canon, via: "pkf", pkf: pkfAssets })
  }

  // 3. Paired DBT text — the first fileset that carries THIS canon's real
  //    DBT audio (an "a" id, not itself marked non-DBT via audioSource) and
  //    has its own DBT text id — keeps text and narration on one edition
  //    wherever real DBT audio is what will actually play.
  const pairedEntry = filesets.find((f) => f.a?.length && !f.audioSource && f.t && !f.textSource)
  if (pairedEntry) addDbt(pairedEntry.id, "paired-dbt")

  // 4. helloAO via source-catalog.json — dropped (not silently trusted) if
  //    media.json's own h[] list exists and doesn't contain this id (catches
  //    a stale/incorrect source-catalog entry, e.g. Indonesian OT's
  //    "ind_ags", which media.json's own OT h[] doesn't include).
  if (sourceCatalogSrc?.provider === "helloao" && sourceCatalogSrc.id) {
    const h = canonMedia?.h
    if (!h || h.includes(sourceCatalogSrc.id)) {
      add({ provider: "helloao", id: sourceCatalogSrc.id, canon, via: "source-catalog" })
    }
  }

  // 5. Other DBT filesets via media.json, in preference order.
  for (const f of filesets) {
    if (f.t && !f.textSource) addDbt(f.id, "media-dbt")
  }

  // 6. DBT via source-catalog.json — id used verbatim (source-catalog's own
  //    resolution already accounts for languages whose real id isn't
  //    derivable from media.json's base id at all, e.g. Norwegian's
  //    "NORNBS").
  if (sourceCatalogSrc?.provider === "dbt" && sourceCatalogSrc.id) {
    add({ provider: "dbt", id: sourceCatalogSrc.id, canon, via: "source-catalog-dbt" })
  }

  // 7. Remaining helloAO ids from media.json's own h[] (coverage
  //    unverified — chapter-doc.ts tolerates a 404 and moves on).
  for (const tid of canonMedia?.h ?? []) {
    add({ provider: "helloao", id: tid, canon, via: "media-h" })
  }

  // 8. openbible.
  if (openbibleEdition) add({ provider: "openbible", id: openbibleEdition, canon, via: "openbible" })

  return out
}

// ── gathering (all IO) ───────────────────────────────────────────────────

async function gatherInputs(iso: string, canon: "nt" | "ot"): Promise<TextEditionInputs> {
  const preferred = preferredFilesetId(iso, canon)
  const [media, pkfInfo, sourceCatalogSrc, overlap] = await Promise.all([
    loadLanguageMedia(iso),
    loadPkfInfo(iso),
    resolveTextSource(iso, canon),
    loadOverlapCatalog(),
  ])
  const canonMedia: CanonMedia | null = media?.canons?.[canon] ?? null
  const filesets = orderedByPreference(canonMedia?.filesets ?? [], preferred)

  let preferredSidecarText: { source?: string; id?: string } | null = null
  if (preferred && !canonMedia?.filesets?.some((f) => f.id === preferred)) {
    const sidecar = await loadHelloaoSource(canon, iso, preferred)
    preferredSidecarText = sidecar?.text ?? null
  }

  return {
    iso,
    canon,
    preferredText: preferredTextFor(iso, canon),
    preferred,
    canonMedia,
    filesets,
    pkfAssets: pkfAssetsOf(iso, pkfInfo),
    sourceCatalogSrc,
    overlap,
    preferredSidecarText,
    openbibleEdition: (openbibleEditions as Record<string, string>)[iso] ?? null,
  }
}

const editionsCache = new Map<string, Promise<TextEdition[]>>()

/** Every real candidate for (iso, canon), cached per session. */
export function resolveTextEditions(iso: string, canon: "nt" | "ot"): Promise<TextEdition[]> {
  const key = `${iso}:${canon}`
  const cached = editionsCache.get(key)
  if (cached) return cached
  const debug = typeof window !== "undefined" && window.location.search.includes("readerdebug")
  const p = gatherInputs(iso, canon).then((inputs) => {
    const ranked = rankTextEditions(inputs)
    if (debug) {
      console.log(`[readerdebug/text-edition] ${iso} ${canon}`, {
        preferredText: inputs.preferredText,
        preferred: inputs.preferred,
        hasPkf: !!inputs.pkfAssets,
        sourceCatalogSrc: inputs.sourceCatalogSrc,
        filesetIds: inputs.canonMedia?.filesets?.map((f) => f.id),
        ranked: ranked.map((e) => `${e.provider}:${e.id}(${e.via})`),
      })
    }
    return ranked
  })
  editionsCache.set(key, p)
  return p
}

/** First (highest-priority) candidate, or null if this canon has no real
 *  text source at all. */
export async function resolveTextEdition(iso: string, canon: "nt" | "ot"): Promise<TextEdition | null> {
  const eds = await resolveTextEditions(iso, canon)
  return eds[0] ?? null
}
