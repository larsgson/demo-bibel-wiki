import { pkfUrl } from "./pkf-url"

/**
 * openbible (Biblica's Open Bible catalog, via bcv-commons/bibles' CDN
 * proxy) — a fourth text source, announced 2026-09-16, not yet live on the
 * CDN as of this writing (implemented ahead of go-live per explicit
 * instruction — the shape below is exactly what bibles' announcement
 * documented; verify against a real response once it's confirmed live).
 *
 * Unlike DBT/PKF/helloAO, bibles doesn't proxy openbible's raw content
 * (whole-edition USFM/USX zips from Biblica's own API) — they instead
 * publish an already-parsed, per-chapter derivative specifically so
 * clients don't need their own zip/USFM handling. Path convention:
 *
 *   https://cdn.bibel.wiki/openbible/<iso>/<edition>/<book>/<chapter>.json
 *   https://cdn.bibel.wiki/openbible/<iso>/<edition>/_meta.json
 *
 * `<edition>` is Biblica/yaapi.bible's own edition abbreviation (e.g.
 * "MGJ") — NOT the long hex-string "o:" ids currently seen in bibles'
 * own catalog/overlap.json (those are Biblica's internal project/version
 * ids, a different identifier entirely; confirmed live, 2026-09-16 —
 * e.g. "o:66db7559f881a336a4af526a" for "abc"). There is currently no
 * published bulk iso->edition-abbreviation mapping to resolve this
 * automatically, so editions are configured manually in
 * ../../data/openbible-editions.json until one exists (ask bibles, or
 * check whether the go-live confirmation clarifies this).
 */

export interface OpenbibleMeta {
  name: string
  license: string
  provider: string
  copyright: string
  source: string
  source_url: string
  openbible_link: string
  books: string[]
}

interface RawOpenbibleChapter {
  book: string
  chapter: number
  verses: { verse: number; text: string }[]
}

const chapterCache = new Map<string, Promise<{ num: number; text: string }[] | null>>()

/** One chapter's plain verse text from openbible, already parsed by
 *  bibles' CDN — no USFM/USX handling needed on our side at all. */
export function fetchOpenbibleChapter(
  iso: string,
  edition: string,
  book: string,
  chapter: number,
): Promise<{ num: number; text: string }[] | null> {
  const key = `${iso}/${edition}/${book}/${chapter}`
  const cached = chapterCache.get(key)
  if (cached) return cached
  const p = fetch(pkfUrl(`/openbible/${iso}/${edition}/${book}/${chapter}.json`))
    .then((r) => (r.ok ? (r.json() as Promise<RawOpenbibleChapter>) : null))
    .then((data) => {
      if (!Array.isArray(data?.verses)) return null
      return data.verses.map((v) => ({ num: v.verse, text: v.text }))
    })
    .catch(() => null)
  chapterCache.set(key, p)
  return p
}

const metaCache = new Map<string, Promise<OpenbibleMeta | null>>()

/** Per-edition attribution/license — one fetch per edition, not per
 *  chapter. Needed for display (bibles asked that yaapi.bible/Biblica be
 *  credited using each edition's own provider/copyright fields) and for
 *  ND detection (see isNDLicense) — checked per EDITION, not per
 *  language, since a single iso can have multiple openbible editions
 *  under different licenses. */
export function fetchOpenbibleMeta(iso: string, edition: string): Promise<OpenbibleMeta | null> {
  const key = `${iso}/${edition}`
  const cached = metaCache.get(key)
  if (cached) return cached
  const p = fetch(pkfUrl(`/openbible/${iso}/${edition}/_meta.json`))
    .then((r) => (r.ok ? (r.json() as Promise<OpenbibleMeta>) : null))
    .catch(() => null)
  metaCache.set(key, p)
  return p
}

/**
 * ND (No-Derivatives) clause detection. Deliberately per-edition, checked
 * at point of use — unlike PKF's config/licenses.json (a per-LANGUAGE
 * allow/deny list, whole languages excluded from public release), ND
 * openbible editions are NOT excluded here: show them, just label the
 * license clearly wherever this returns true (explicit instruction,
 * 2026-09-16 — the opposite of what our own initial request to bibles
 * asked for; they may still publish only the non-ND subset for now, in
 * which case this simply never fires yet).
 */
export function isNDLicense(license: string | undefined | null): boolean {
  if (!license) return false
  return /ND/i.test(license)
}
