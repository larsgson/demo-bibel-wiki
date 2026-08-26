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
// cdn.bibel.wiki/dbt/_app/catalog-overlap.json computes, build-side, which
// translations exist per language+canon and how they relate (near-duplicate
// clustering via text-similarity probing). That changes rarely (only when
// the CDN's own catalog is regenerated), so we bake a small derived lookup
// here rather than re-deriving a provider/id per chapter load at runtime.
//
// Schema (as of 2026-07): `entries` is `[iso, canon, info]`, ONE ROW PER
// DISTINCT-TRANSLATION CLUSTER (not per provider) — a language+canon can
// have many rows, each `info.ids` a same-content group across providers
// (e.g. `["dbt:ENGKJV", "helloao:eng_kjv"]`) with `info.default` naming the
// preferred id WITHIN that one cluster. There's no single "the" default for
// the whole iso+canon anymore (earlier schema versions had one at the top
// level as `defaults["iso:canon"]` — that key is gone). So: collect every
// id across every cluster for this iso+canon (preferring each cluster's own
// `default` first), then pick by provider priority (`overlap.priority`,
// currently pkf > helloao > dbt) — first id found for the top-priority
// provider present wins.
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
  let catalog = {}
  try {
    const res = await fetch("https://cdn.bibel.wiki/dbt/_app/catalog-overlap.json")
    if (!res.ok) throw new Error(`fetch catalog-overlap.json: ${res.status}`)
    const overlap = await res.json()
    const priority = overlap.priority ?? ["pkf", "helloao", "dbt"]

    // Group every cluster row by iso+canon first.
    const byIsoCanon = new Map()
    for (const [iso, canon, info] of overlap.entries ?? []) {
      const key = `${iso}:${canon}`
      if (!byIsoCanon.has(key)) byIsoCanon.set(key, [])
      byIsoCanon.get(key).push(info)
    }

    for (const [key, rows] of byIsoCanon) {
      const [iso, canon] = key.split(":")
      // Each cluster's own preferred id goes first, then its other ids.
      const allIds = []
      for (const info of rows) {
        const preferred = info.default
        if (preferred) allIds.push(preferred)
        for (const id of info.ids ?? []) {
          if (id !== preferred) allIds.push(id)
        }
      }
      let resolved = null
      for (const provider of priority) {
        const match = allIds.find((x) => x.startsWith(provider + ":"))
        if (match) {
          resolved = { provider, id: match.slice(provider.length + 1) }
          break
        }
      }
      if (!resolved) continue
      catalog[iso] ??= {}
      catalog[iso][canon] = resolved.provider === "pkf" ? { provider: "pkf" } : resolved
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
