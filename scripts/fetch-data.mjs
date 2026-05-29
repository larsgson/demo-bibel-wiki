#!/usr/bin/env node
/**
 * Fetch PKF data from the se-regional-data GitHub release.
 * Run via: pnpm fetch:data   (or automatically as prebuild)
 *
 * Environment variables:
 *   DATA_REPO          — GitHub repo (default: larsgson/se-regional-data)
 *   DATA_RELEASE_TAG   — Release tag (default: "latest")
 *   SKIP_DATA_FETCH    — Set to "1" to skip (useful in CI when data is cached)
 *
 * Reconstructed from project history — verify asset names against the actual
 * se-regional-data release if the download fails.
 */

import { execSync } from "node:child_process"
import { existsSync, mkdirSync, rmSync, writeFileSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { createHash } from "node:crypto"

const REPO = process.env.DATA_REPO ?? "larsgson/se-regional-data"
const TAG = process.env.DATA_RELEASE_TAG ?? "latest"
const SKIP = process.env.SKIP_DATA_FETCH === "1"
const DATA_DIR = "data/pkf"

if (SKIP) {
  console.log("SKIP_DATA_FETCH=1 — skipping data fetch.")
  process.exit(0)
}

if (existsSync(join(DATA_DIR, "manifest.json"))) {
  console.log(`Data already present at ${DATA_DIR}/manifest.json — skipping fetch.`)
  console.log("Delete data/pkf/ to force re-fetch, or set SKIP_DATA_FETCH=1 to silence this.")
  process.exit(0)
}

console.log(`\n── Fetching data from ${REPO} (tag: ${TAG}) ──\n`)

// Resolve the release URL
const releaseApi =
  TAG === "latest"
    ? `https://api.github.com/repos/${REPO}/releases/latest`
    : `https://api.github.com/repos/${REPO}/releases/tags/${TAG}`

let releaseInfo
try {
  const res = await fetch(releaseApi, {
    headers: { Accept: "application/vnd.github+json" },
  })
  if (!res.ok) throw new Error(`GitHub API ${res.status}: ${res.statusText}`)
  releaseInfo = await res.json()
} catch (err) {
  console.error(`Failed to fetch release info: ${err.message}`)
  process.exit(1)
}

console.log(`Release: ${releaseInfo.tag_name} (${releaseInfo.name ?? ""})`)

// Find the tar.zstd asset
const asset = releaseInfo.assets?.find(
  (a) => a.name.endsWith(".tar.zstd") || a.name.endsWith(".tar.zst")
)

if (!asset) {
  console.error("No .tar.zstd asset found in release. Available assets:")
  for (const a of releaseInfo.assets ?? []) console.error(`  - ${a.name}`)
  process.exit(1)
}

console.log(`Downloading ${asset.name} (${(asset.size / 1e6).toFixed(1)} MB)...`)

const tmpDir = join("data", ".fetch-tmp")
mkdirSync(tmpDir, { recursive: true })
const archivePath = join(tmpDir, asset.name)

try {
  execSync(
    `curl -fSL -o "${archivePath}" "${asset.browser_download_url}"`,
    { stdio: "inherit" }
  )
} catch {
  console.error("Download failed.")
  rmSync(tmpDir, { recursive: true, force: true })
  process.exit(1)
}

// Check for a checksum file
const checksumAsset = releaseInfo.assets?.find(
  (a) => a.name === asset.name + ".sha256" || a.name === "checksums.txt"
)
if (checksumAsset) {
  console.log("Verifying checksum...")
  try {
    const res = await fetch(checksumAsset.browser_download_url)
    const checksumText = await res.text()
    const expected = checksumText.split("\n").find((l) => l.includes(asset.name))
    if (expected) {
      const hash = createHash("sha256")
        .update(readFileSync(archivePath))
        .digest("hex")
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

// Extract
console.log(`Extracting to ${DATA_DIR}/...`)
mkdirSync(DATA_DIR, { recursive: true })
try {
  execSync(`tar --use-compress-program=unzstd -xf "${archivePath}" -C "${DATA_DIR}"`, {
    stdio: "inherit",
  })
} catch {
  // Fallback: try without zstd (some systems use different flags)
  try {
    execSync(`zstd -d "${archivePath}" --stdout | tar xf - -C "${DATA_DIR}"`, {
      stdio: "inherit",
    })
  } catch {
    console.error("Extraction failed. Ensure zstd is installed: brew install zstd")
    rmSync(tmpDir, { recursive: true, force: true })
    process.exit(1)
  }
}

// Cleanup
rmSync(tmpDir, { recursive: true, force: true })

if (existsSync(join(DATA_DIR, "manifest.json"))) {
  console.log(`\n── Data fetch complete ── ${DATA_DIR}/manifest.json present ──\n`)
} else {
  console.warn("\n⚠ manifest.json not found after extraction — check archive contents.\n")
}
