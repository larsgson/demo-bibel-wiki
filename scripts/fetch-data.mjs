#!/usr/bin/env node
/**
 * Fetch build-time data:
 *   1. PKF data from the se-regional-data GitHub release
 *   2. Story data (language catalog + audio timings) from bible-story-builder
 *   3. Source catalog (per-language text-provider resolution) from cdn.bibel.wiki
 *
 * English/BSB text now comes live from helloAO (see src/lib/reader/helloaoCatalog.ts
 * and helloaoChapterRender.ts) — this script no longer fetches/generates any local
 * BSB data.
 *
 * Run via: pnpm fetch:data   (or automatically as prebuild)
 *
 * Environment variables:
 *   DATA_REPO          — GitHub repo for PKF (default: larsgson/se-regional-data)
 *   DATA_RELEASE_TAG   — Release tag (default: "latest")
 *   STORY_REPO         — GitHub repo for story data (default: larsgson/bible-story-builder)
 *   STORY_RELEASE_TAG  — Story release tag (default: "latest")
 *   SKIP_DATA_FETCH    — Set to "1" to skip (useful in CI when data is cached)
 */

import { execSync } from "node:child_process"
import { existsSync, mkdirSync, rmSync, writeFileSync, readFileSync, symlinkSync, lstatSync, readdirSync } from "node:fs"
import { join } from "node:path"
import { createHash } from "node:crypto"

const REPO = process.env.DATA_REPO ?? "larsgson/se-regional-data"
const TAG = process.env.DATA_RELEASE_TAG ?? "latest"
const SKIP = process.env.SKIP_DATA_FETCH === "1"
const DATA_DIR = "data/pkf"
const STORY_REPO = process.env.STORY_REPO ?? "larsgson/bible-story-builder"
const STORY_TAG = process.env.STORY_RELEASE_TAG ?? "latest"
const PUBLIC_DIR = "public"
const SOURCE_CATALOG_PATH = "data/source-catalog.json"

if (SKIP) {
  console.log("SKIP_DATA_FETCH=1 — skipping data fetch.")
  process.exit(0)
}

// ── 1. PKF data ──
//
// Two modes:
//   • PUBLIC_PKF_BASE_URL set → the browser fetches .pkf data from the CDN, so
//     the build only needs the small manifest.json (regions.ts imports it at
//     build time). The ~732 MB tar is NOT downloaded.
//   • unset → serve .pkf from the in-deploy /pkf, so download + extract the tar.
//
// In BOTH modes we must ensure data/pkf/manifest.json exists, because the
// global tar does NOT contain it (it's a separate release asset).

const PKF_BASE = (process.env.PUBLIC_PKF_BASE_URL ?? "").trim().replace(/\/+$/, "")
const manifestPath = join(DATA_DIR, "manifest.json")

function hasFullPkfData() {
  if (!existsSync(DATA_DIR)) return false
  // Any entry besides manifest.json / dotfiles means the tree is extracted.
  return readdirSync(DATA_DIR).some((n) => n !== "manifest.json" && !n.startsWith("."))
}

const needManifest = !existsSync(manifestPath)
const needFullData = !PKF_BASE && !hasFullPkfData()

if (!needManifest && !needFullData) {
  console.log(`PKF data already present — skipping.`)
} else {
  console.log(`\n── Fetching PKF data from ${REPO} (tag: ${TAG}) ──\n`)
  mkdirSync(DATA_DIR, { recursive: true })

  // Lazily fetched only when we actually need the GitHub release (full data, or
  // manifest fallback). Avoids an API call when the CDN can serve the manifest.
  let releaseInfo = null
  async function getReleaseInfo() {
    if (releaseInfo) return releaseInfo
    const releaseApi =
      TAG === "latest"
        ? `https://api.github.com/repos/${REPO}/releases/latest`
        : `https://api.github.com/repos/${REPO}/releases/tags/${TAG}`
    const res = await fetch(releaseApi, { headers: { Accept: "application/vnd.github+json" } })
    if (!res.ok) throw new Error(`GitHub API ${res.status}: ${res.statusText}`)
    releaseInfo = await res.json()
    console.log(`Release: ${releaseInfo.tag_name} (${releaseInfo.name ?? ""})`)
    return releaseInfo
  }

  // 1a. Ensure manifest.json (build-time dependency of regions.ts).
  if (needManifest) {
    let manifestText = null
    // Prefer the CDN when externalized — single source of truth.
    if (PKF_BASE) {
      try {
        const r = await fetch(`${PKF_BASE}/pkf/manifest.json`)
        if (r.ok) { manifestText = await r.text(); console.log("  ✓ manifest.json (from CDN)") }
      } catch { /* fall through to GitHub */ }
    }
    // Fallback: the standalone manifest asset on the GitHub release.
    if (!manifestText) {
      const info = await getReleaseInfo()
      const a = info.assets?.find((x) => x.name.startsWith("manifest-global") && x.name.endsWith(".json"))
      if (!a) { console.error("No standalone manifest-global-*.json asset found."); process.exit(1) }
      const r = await fetch(a.browser_download_url)
      if (!r.ok) { console.error(`Failed to fetch manifest: ${r.status}`); process.exit(1) }
      manifestText = await r.text()
      console.log(`  ✓ manifest.json (from release asset ${a.name})`)
    }
    writeFileSync(manifestPath, manifestText)
  }

  // 1b. Full data — only when serving from the in-deploy /pkf (no CDN).
  if (needFullData) {
    const info = await getReleaseInfo()
    const asset = info.assets?.find((a) => a.name.endsWith(".tar.zstd") || a.name.endsWith(".tar.zst"))
    if (!asset) {
      console.error("No .tar.zstd asset found in release. Available assets:")
      for (const a of info.assets ?? []) console.error(`  - ${a.name}`)
      process.exit(1)
    }

    console.log(`Downloading ${asset.name} (${(asset.size / 1e6).toFixed(1)} MB)...`)
    const tmpDir = join("data", ".fetch-tmp")
    mkdirSync(tmpDir, { recursive: true })
    const archivePath = join(tmpDir, asset.name)

    try {
      execSync(`curl -fSL -o "${archivePath}" "${asset.browser_download_url}"`, { stdio: "inherit" })
    } catch {
      console.error("Download failed.")
      rmSync(tmpDir, { recursive: true, force: true })
      process.exit(1)
    }

    const checksumAsset = info.assets?.find(
      (a) => a.name === asset.name + ".sha256" || a.name === "checksums.txt"
    )
    if (checksumAsset) {
      console.log("Verifying checksum...")
      try {
        const res = await fetch(checksumAsset.browser_download_url)
        const checksumText = await res.text()
        const expected = checksumText.split("\n").find((l) => l.includes(asset.name))
        if (expected) {
          const hash = createHash("sha256").update(readFileSync(archivePath)).digest("hex")
          const expectedHash = expected.split(/\s+/)[0]
          if (hash !== expectedHash) {
            console.error(`Checksum mismatch! Expected ${expectedHash}, got ${hash}`)
            rmSync(tmpDir, { recursive: true, force: true })
            process.exit(1)
          }
          console.log("  ✓ Checksum verified")
        }
      } catch (err) {
        console.warn(`  ⚠ Could not verify checksum: ${err.message}`)
      }
    }

    console.log(`Extracting to ${DATA_DIR}/...`)
    try {
      execSync(`tar --use-compress-program=unzstd --warning=no-unknown-keyword -xf "${archivePath}" -C "${DATA_DIR}"`, { stdio: "inherit" })
    } catch {
      try {
        execSync(`zstd -d "${archivePath}" --stdout | tar --warning=no-unknown-keyword -xf - -C "${DATA_DIR}"`, { stdio: "inherit" })
      } catch {
        console.error("Extraction failed. Ensure zstd is installed: brew install zstd")
        rmSync(tmpDir, { recursive: true, force: true })
        process.exit(1)
      }
    }
    rmSync(tmpDir, { recursive: true, force: true })
    console.log(`  ✓ PKF data ready`)
  } else if (PKF_BASE) {
    console.log(`  PUBLIC_PKF_BASE_URL=${PKF_BASE} — serving .pkf from CDN; skipped the ~732 MB data download.`)
  }
}

// Ensure public/pkf symlink
ensureSymlink("../data/pkf", "public/pkf")

// ── 2. Story data (language catalog + audio timings) from bible-story-builder ──
//
// Browser-fetched at runtime from public/:
//   • ALL-langs-compact.json / ALL-langs-mini.json  — language names + catalog
//   • ALL-langs-data/                               — per-language story index
//   • templates/<tpl>/ALL-timings/                  — audio timing per template
// Story CONTENT (markdown/locales) is committed in this repo, so it is NOT fetched.

if (existsSync(join(PUBLIC_DIR, "ALL-langs-data", "manifest.json"))) {
  console.log(`Story data already present at ${PUBLIC_DIR}/ALL-langs-data/ — skipping.`)
} else {
  console.log(`\n── Fetching story data from ${STORY_REPO} (tag: ${STORY_TAG}) ──\n`)

  // Which templates to fetch timing for — driven by site.config.json.
  let templates = ["John", "TGS", "OBS"]
  try {
    const cfg = JSON.parse(readFileSync("site.config.json", "utf8"))
    if (Array.isArray(cfg.templates) && cfg.templates.length) templates = cfg.templates
  } catch { /* fall back to the default list */ }

  const dlBase = `https://github.com/${STORY_REPO}/releases/${
    STORY_TAG === "latest" ? "latest/download" : "download/" + STORY_TAG
  }`
  const tmpDir = join("data", ".fetch-tmp")
  mkdirSync(tmpDir, { recursive: true })

  // 3a. Language JSON files (from the repo main branch export/).
  for (const f of ["ALL-langs-compact.json", "ALL-langs-mini.json"]) {
    const r = await fetch(`https://raw.githubusercontent.com/${STORY_REPO}/main/export/${f}`)
    if (!r.ok) { console.error(`Failed to fetch ${f}: ${r.status}`); process.exit(1) }
    writeFileSync(join(PUBLIC_DIR, f), await r.text())
    console.log(`  ✓ ${f}`)
  }

  // 3b. ALL-langs-data (per-language story index). Zip has manifest.json at root.
  const langZip = join(tmpDir, "ALL-langs-data.zip")
  console.log("  Downloading ALL-langs-data.zip...")
  execSync(`curl -fSL -o "${langZip}" "${dlBase}/ALL-langs-data.zip"`, { stdio: "inherit" })
  const langDest = join(PUBLIC_DIR, "ALL-langs-data")
  rmSync(langDest, { recursive: true, force: true })
  mkdirSync(langDest, { recursive: true })
  execSync(`unzip -q "${langZip}" -d "${langDest}"`, { stdio: "inherit" })
  console.log("  ✓ ALL-langs-data/")

  // 3c. Per-template audio timing. Each zip has manifest.json at root.
  for (const tpl of templates) {
    const zipName = `${tpl}-ALL-timings.zip`
    const zipPath = join(tmpDir, zipName)
    process.stdout.write(`  ${zipName}... `)
    try {
      execSync(`curl -fSL -o "${zipPath}" "${dlBase}/${zipName}"`, { stdio: "pipe" })
    } catch {
      console.log("⊘ (not in release)")
      continue
    }
    const dest = join(PUBLIC_DIR, "templates", tpl, "ALL-timings")
    rmSync(dest, { recursive: true, force: true })
    mkdirSync(dest, { recursive: true })
    execSync(`unzip -q "${zipPath}" -d "${dest}"`, { stdio: "inherit" })
    console.log("✓")
  }

  rmSync(tmpDir, { recursive: true, force: true })
  console.log(`  ✓ Story data ready`)
}

// ── 3. Source catalog (per-language text-provider resolution) ──
//
// cdn.bibel.wiki/catalog/overlap.json computes, build-side, which
// translations exist per language+canon and how they relate (near-duplicate
// clustering via text-similarity probing). That changes rarely (only when
// the CDN's own catalog is regenerated), so we bake a small derived lookup
// here rather than re-deriving a provider/id per chapter load at runtime.
//
// Schema (as of 2026-08, second revision — see below): `entries` is an
// OBJECT keyed by `"iso:canon"` (e.g. `"aai:nt"`), not an array of
// `[iso, canon, info]` triples. Each value is a list of CLUSTER objects, one
// per DISTINCT-TRANSLATION cluster for that iso+canon (a language+canon can
// have several) — each cluster's `ids` is a same-content group across
// providers, but now using single-LETTER prefixes (`d:`/`h:`/`p:` for
// dbt/helloao/pkf, e.g. `["d:ENGKJV", "h:eng_kjv"]`), not the full provider
// name the previous schema used (`"dbt:ENGKJV"`). There is no per-cluster
// `default` field anymore either — every id in `ids` is treated as equally
// preferred within its cluster. Collect every id across every cluster for
// this iso+canon, then pick by provider priority (`overlap.priority`,
// currently pkf > helloao > dbt) — first id found for the top-priority
// provider present wins.
//
// PRIOR REVISION (2026-07, now defunct): `entries` was an array of
// `[iso, canon, info]` triples with full-word provider prefixes and a
// per-cluster `default` field. That shape silently broke this script on
// every build once the CDN moved to the shape above — `for (const [iso,
// canon, info] of overlap.entries)` throws "object is not iterable" against
// a plain object, which the catch block below swallows into a `{}` fallback
// with no build failure, so this went unnoticed until every region's
// "available language" count (and any Reader pane sourced from DBT/helloAO)
// silently zeroed out. Handle a future reshape by checking `Array.isArray`
// up front and branching, the same defensive pattern src/lib/data/regions.ts
// already uses for manifest.json's own past shape change — don't assume this
// won't drift again.
//
// The DERIVED file only resolves the PROVIDER, plus a translation id when
// resolvable (see above). When a language has many same-priority-provider
// clusters with no clear single winner, this just takes the first one
// encountered — arbitrary, but deterministic; app-level curated overrides
// (config/bible-sources.json) still win over this for any language that
// actually needs a specific pick. See src/lib/bw/version-config.ts.

// Only trust a cached file that actually has content — a prior failed fetch
// falls back to writing "{}" (see the catch block below) so the build still
// has a valid JSON module to import, but that fallback must NOT be mistaken
// for "already fetched successfully" on a later build. Without this check, a
// single transient CDN failure gets cached (e.g. by Netlify's build cache
// persisting data/ between builds) and silently zeroes out every region's
// "available language" count forever, since existsSync() alone can't tell
// a real catalog from the empty-object failure placeholder.
const hasCachedSourceCatalog = (() => {
  if (!existsSync(SOURCE_CATALOG_PATH)) return false
  try {
    return Object.keys(JSON.parse(readFileSync(SOURCE_CATALOG_PATH, "utf8"))).length > 0
  } catch {
    return false
  }
})()

if (hasCachedSourceCatalog) {
  console.log(`Source catalog already present at ${SOURCE_CATALOG_PATH} — skipping.`)
} else {
  console.log(`\n── Building source catalog from cdn.bibel.wiki ──\n`)

  // bcv-commons/bibles added a `schema_version` field (int, bumped only on
  // breaking shape changes) to catalog-overlap.json/catalog-index.json/
  // catalog-audio-index.json after this exact script silently broke on
  // catalog-overlap.json's 2026-07-28 reshape (see the schema note further
  // down) — this script's own destructuring assumed one shape with no way
  // to detect a newer one had shipped. EXPECTED_SCHEMA_VERSIONS below is
  // "the version this script's parsing logic was last verified against";
  // bump it (and update the parsing code) whenever the upstream field
  // increments. A field that's newer than expected doesn't stop the build —
  // the existing try/catch already keeps a parse failure from taking down
  // the whole site — but it turns a silent, hours-later "why is everything
  // 0" investigation into an immediate, specific build-log warning.
  const EXPECTED_SCHEMA_VERSIONS = { "catalog/overlap.json": 2, "catalog/index.json": 1 }
  function checkSchemaVersion(name, obj) {
    const expected = EXPECTED_SCHEMA_VERSIONS[name]
    const actual = obj?.schema_version
    if (actual == null) {
      console.warn(`  ⚠ ${name} has no schema_version field yet (expected ${expected}) — cached/propagating, or the field hasn't shipped for this file. Parsing as the last-known shape.`)
    } else if (actual > expected) {
      console.warn(`  ⚠ ${name} schema_version is ${actual}, but this script's parser was last verified against ${expected}. It may have silently broken again — check the build output below for a suspiciously low/zero result and update EXPECTED_SCHEMA_VERSIONS + the parsing logic once confirmed.`)
    }
  }

  let catalog = {}
  try {
    // NOTE: NOT dbt/_app/catalog-overlap.json — bcv-commons/bibles migrated
    // every catalog-*.json to /catalog/*.json on 2026-08-11, and the old
    // /dbt/_app/ paths are explicitly excluded from every publish since
    // (`STALE_APP_CATALOG_FILES` in pipeline/core/cdn_dbt_delta.py) — that
    // path is permanently frozen at its 2026-07-28 content and will never
    // update again. Cost real debugging time to catch since the old path
    // still returns 200 with a plausible-looking (just stale) body.
    const res = await fetch("https://cdn.bibel.wiki/catalog/overlap.json")
    if (!res.ok) throw new Error(`fetch catalog/overlap.json: ${res.status}`)
    const overlap = await res.json()
    checkSchemaVersion("catalog/overlap.json", overlap)
    const priority = overlap.priority ?? ["pkf", "helloao", "dbt"]
    const PROVIDER_BY_PREFIX = { d: "dbt", h: "helloao", p: "pkf" }

    // Normalize both known shapes into byIsoCanon: Map<"iso:canon", clusters[]>,
    // each cluster `{ ids: string[] }` with ids using the CURRENT single-letter
    // prefix scheme (d:/h:/p:) — see the schema note above for why this can't
    // just assume one shape.
    const byIsoCanon = new Map()
    if (Array.isArray(overlap.entries)) {
      // Prior (2026-07) shape: array of [iso, canon, info] triples, full-word
      // prefixes, per-cluster `default`. Normalize into the current shape so
      // the resolution loop below only has one format to handle.
      for (const [iso, canon, info] of overlap.entries) {
        const key = `${iso}:${canon}`
        if (!byIsoCanon.has(key)) byIsoCanon.set(key, [])
        const preferred = info.default
        const ids = preferred ? [preferred, ...(info.ids ?? []).filter((id) => id !== preferred)] : (info.ids ?? [])
        byIsoCanon.get(key).push({ ids })
      }
    } else {
      // Current (2026-08) shape: object keyed by "iso:canon", each value a
      // list of cluster objects already in the right shape.
      for (const [key, clusters] of Object.entries(overlap.entries ?? {})) {
        byIsoCanon.set(key, clusters)
      }
    }

    for (const [key, clusters] of byIsoCanon) {
      const [iso, canon] = key.split(":")
      const allIds = clusters.flatMap((c) => c.ids ?? [])
      let resolved = null
      for (const provider of priority) {
        const match = allIds.find((x) => {
          const prefix = x.split(":")[0]
          return prefix === provider || PROVIDER_BY_PREFIX[prefix] === provider
        })
        if (match) {
          const [prefix, ...rest] = match.split(":")
          const id = rest.join(":")
          resolved = { provider: PROVIDER_BY_PREFIX[prefix] ?? prefix, id }
          break
        }
      }
      if (!resolved) continue
      catalog[iso] ??= {}
      catalog[iso][canon] = resolved.provider === "pkf" ? { provider: "pkf" } : resolved
    }

    // ── Supplementary pass: single-candidate pairs via catalog-index.json ──
    //
    // catalog-overlap.json is NOT a full existence catalog — per its own
    // maintainers (bcv-commons/bibles), it deliberately EXCLUDES any
    // (iso,canon) with exactly one known candidate across DBT+PKF+helloAO
    // combined: with nothing to compare it against, compare_all.py never
    // even fetches it, so it gets no row at all. That's by design, not a
    // gap in overlap.json — but it means source-catalog.json above, built
    // from overlap.json alone, was silently missing every genuinely
    // single-source language (~1,577 of ~2,572 (iso,canon) pairs live, per a
    // spot check). The actual "does X exist at all" signal is
    // cdn.bibel.wiki/catalog/index.json — `entries` is `[iso, canon,
    // providerLetter, count?]`, one row per (iso, canon, provider) that has
    // ANY candidate; canon values are `nt`/`ot`/`ntp`/`otp` (the `p` suffix
    // = partial — treated the same as full here, matching this app's
    // existing tolerance for incomplete-but-real translations, e.g. an
    // NT-only language is already treated as fully "available").
    //
    // Only fill (iso,canon) pairs with EXACTLY ONE provider row here — a
    // pair with 2+ providers should already be in catalog-overlap.json's
    // dedup/preference logic above; if it's somehow still unresolved this
    // pass intentionally leaves it alone rather than guessing which
    // candidate to prefer (that comparison is overlap.json's job, not
    // ours). Never overrides anything the overlap pass above already set.
    try {
      const [indexRes, helloaoRes, dbtRes] = await Promise.all([
        fetch("https://cdn.bibel.wiki/catalog/index.json"),
        fetch("https://bible.helloao.org/api/available_translations.json"),
        fetch("https://cdn.bibel.wiki/dbt/_catalog.json"),
      ])
      if (!indexRes.ok) throw new Error(`fetch catalog/index.json: ${indexRes.status}`)
      const index = await indexRes.json()
      checkSchemaVersion("catalog/index.json", index)
      const helloaoByIso = new Map()
      if (helloaoRes.ok) {
        const { translations } = await helloaoRes.json()
        for (const t of translations ?? []) {
          if (!helloaoByIso.has(t.language)) helloaoByIso.set(t.language, [])
          helloaoByIso.get(t.language).push(t)
        }
      }
      // DBT raw rows: [iso, dbtId, canon, ...fields], a "t:"/"T:" field
      // means real fetchable text exists (vs. "a:"/"A:" audio-only) — see
      // config/regions/za.toml's/cas.toml's own notes on this exact
      // raw-catalog audio-vs-text distinction.
      const dbtTextByIsoCanon = new Map()
      if (dbtRes.ok) {
        const { versions } = await dbtRes.json()
        for (const [iso, id, rawCanon, ...fields] of versions ?? []) {
          const canon = rawCanon.startsWith("nt") ? "nt" : rawCanon.startsWith("ot") ? "ot" : rawCanon
          const hasText = fields.some((f) => f[0] === "t" || f[0] === "T")
          if (!hasText) continue
          const key = `${iso}:${canon}`
          if (!dbtTextByIsoCanon.has(key)) dbtTextByIsoCanon.set(key, id)
        }
      }

      const byIsoCanonProviders = new Map()
      for (const [iso, rawCanon, provider] of index.entries ?? []) {
        const canon = rawCanon.startsWith("nt") ? "nt" : rawCanon.startsWith("ot") ? "ot" : rawCanon
        const key = `${iso}:${canon}`
        if (!byIsoCanonProviders.has(key)) byIsoCanonProviders.set(key, new Set())
        byIsoCanonProviders.get(key).add(provider)
      }

      let filled = 0
      for (const [key, providers] of byIsoCanonProviders) {
        if (providers.size !== 1) continue
        const [iso, canon] = key.split(":")
        catalog[iso] ??= {}
        if (catalog[iso][canon]) continue
        const provider = [...providers][0]
        if (provider === "h") {
          const t = helloaoByIso.get(iso)?.[0]
          if (t) catalog[iso][canon] = { provider: "helloao", id: t.id }
        } else if (provider === "p") {
          catalog[iso][canon] = { provider: "pkf" }
        } else if (provider === "d") {
          const id = dbtTextByIsoCanon.get(key)
          if (id) catalog[iso][canon] = { provider: "dbt", id }
        }
        if (catalog[iso][canon]) filled++
      }
      if (filled > 0) console.log(`  ✓ catalog-index.json single-candidate pass filled ${filled} additional iso+canon entr${filled === 1 ? "y" : "ies"}`)
    } catch (err) {
      console.warn(`  ⚠ Could not cross-check catalog-index.json: ${err.message}`)
      console.warn(`    Proceeding with catalog-overlap.json's resolution alone.`)
    }

    mkdirSync("data", { recursive: true })
    writeFileSync(SOURCE_CATALOG_PATH, JSON.stringify(catalog))
    console.log(`  ✓ source-catalog.json ready (${Object.keys(catalog).length} languages)`)
  } catch (err) {
    console.warn(`  ⚠ Could not build source catalog: ${err.message}`)
    console.warn(`    App falls back to its own runtime resolution for text sources.`)
    mkdirSync("data", { recursive: true })
    writeFileSync(SOURCE_CATALOG_PATH, "{}")
  }
}

// Ensure public/source-catalog.json symlink (client-side fetch access)
ensureSymlink("../data/source-catalog.json", "public/source-catalog.json")

console.log("\n── Data fetch complete ──\n")

// ── Helpers ──

function ensureSymlink(target, linkPath) {
  try {
    if (existsSync(linkPath)) {
      const stat = lstatSync(linkPath)
      if (stat.isSymbolicLink() || stat.isDirectory()) return
    }
    if (!existsSync(linkPath)) {
      symlinkSync(target, linkPath)
      console.log(`  ✓ Symlinked ${linkPath} → ${target}`)
    }
  } catch (err) {
    console.warn(`  ⚠ Could not create symlink ${linkPath}: ${err.message}`)
  }
}
