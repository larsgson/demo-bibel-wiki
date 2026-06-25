#!/usr/bin/env node
/**
 * Update the .pkf language list used by the language picker.
 *
 * Run via: pnpm update-pkf-langs
 *
 * This deliberately fetches ONLY the small standalone manifest JSON asset
 * (~150 KB) from the se-regional-data GitHub release and writes the sorted ISO
 * list to config/pkf-langs.json.
 *
 * It NEVER downloads the multi-hundred-MB .tar.zst PKF data blob, and it NEVER
 * writes into data/pkf/ or public/pkf/ — so refreshing the picker list cannot
 * trigger or alter the actual .pkf binaries. Use scripts/fetch-data.mjs for the
 * data itself; the two are intentionally separate.
 *
 * Environment variables:
 *   DATA_REPO          — GitHub repo (default: larsgson/se-regional-data)
 *   DATA_RELEASE_TAG   — Release tag (default: "latest")
 */

import { writeFileSync } from "node:fs"

const REPO = process.env.DATA_REPO ?? "larsgson/se-regional-data"
const TAG = process.env.DATA_RELEASE_TAG ?? "latest"
const OUT = "config/pkf-langs.json"

const releaseApi =
  TAG === "latest"
    ? `https://api.github.com/repos/${REPO}/releases/latest`
    : `https://api.github.com/repos/${REPO}/releases/tags/${TAG}`

console.log(`\n── Updating .pkf language list from ${REPO} (tag: ${TAG}) ──\n`)

let release
try {
  const res = await fetch(releaseApi, {
    headers: { Accept: "application/vnd.github+json" },
  })
  if (!res.ok) throw new Error(`GitHub API ${res.status}: ${res.statusText}`)
  release = await res.json()
} catch (err) {
  console.error(`Failed to fetch release info: ${err.message}`)
  process.exit(1)
}

console.log(`Release: ${release.tag_name} (${release.name ?? ""})`)

// Find the standalone manifest asset — NOT the .tar.zst data blob.
const manifestAsset = release.assets?.find(
  (a) => a.name.startsWith("manifest-global") && a.name.endsWith(".json"),
)

if (!manifestAsset) {
  console.error("No standalone manifest-global-*.json asset found. Available assets:")
  for (const a of release.assets ?? []) console.error(`  - ${a.name}`)
  process.exit(1)
}

console.log(
  `Fetching ${manifestAsset.name} (${(manifestAsset.size / 1024).toFixed(0)} KB)...`,
)

let manifest
try {
  const res = await fetch(manifestAsset.browser_download_url)
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`)
  manifest = await res.json()
} catch (err) {
  console.error(`Failed to download manifest: ${err.message}`)
  process.exit(1)
}

const languages = Array.isArray(manifest) ? manifest : manifest.languages
if (!Array.isArray(languages)) {
  console.error("Unexpected manifest shape — no `languages` array found.")
  process.exit(1)
}

const isos = [...new Set(languages.map((l) => l?.iso).filter(Boolean))].sort()

writeFileSync(
  OUT,
  JSON.stringify(
    {
      source: `${REPO} release ${release.tag_name} (${manifestAsset.name})`,
      generated_from_manifest_updated_at: manifest.updated_at ?? null,
      count: isos.length,
      isos,
    },
    null,
    2,
  ) + "\n",
)

console.log(`\n  ✓ Wrote ${OUT} — ${isos.length} languages\n`)
