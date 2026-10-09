#!/usr/bin/env node
/**
 * Vendor bcv-commons/bibles' reference Sofria renderer + helloAO converter
 * into src/lib/sofria/vendor/, unmodified, pinned to one upstream commit.
 * See internal-docs/sofria-rendering-migration.md (Phase 1).
 *
 *   npm run sync:sofria                  # re-fetch at the commit in VENDOR.json
 *   npm run sync:sofria -- --ref main    # move the pin to a branch/sha and fetch
 *   npm run sync:sofria -- --check       # verify local files against VENDOR.json
 *                                        # (offline) and report newer upstream commits
 *
 * Uses the GitHub CLI (`gh api`), so no token handling lives here.
 */
import { execFileSync } from "node:child_process"
import { createHash } from "node:crypto"
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const REPO = "bcv-commons/bibles"
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..")
const VENDOR_DIR = join(ROOT, "src/lib/sofria/vendor")
const MANIFEST = join(VENDOR_DIR, "VENDOR.json")

/** local path (relative to VENDOR_DIR) -> upstream path */
const FILES = {
  "render.js": "tools/sofria-render/src/render.js",
  "verses.js": "tools/sofria-render/src/verses.js",
  "index.js": "tools/sofria-render/src/index.js",
  "sources/pkf.js": "tools/sofria-render/src/sources/pkf.js",
  "helloao/helloao_to_usj.mjs": "tools/helloao-to-sofria/helloao_to_usj.mjs",
  "helloao/usj_to_sofria_native.mjs": "tools/helloao-to-sofria/usj_to_sofria_native.mjs",
}

const sha256 = (buf) => createHash("sha256").update(buf).digest("hex")
const gh = (args) => execFileSync("gh", ["api", ...args], { maxBuffer: 64 * 1024 * 1024 })

function readManifest() {
  return existsSync(MANIFEST) ? JSON.parse(readFileSync(MANIFEST, "utf8")) : null
}

function resolveRef(ref) {
  return gh([`repos/${REPO}/commits/${ref}`, "--jq", ".sha"]).toString().trim()
}

function check() {
  const manifest = readManifest()
  if (!manifest) {
    console.error("No VENDOR.json — run `npm run sync:sofria -- --ref main` first.")
    process.exit(1)
  }
  let bad = 0
  for (const [local, { sha256: want }] of Object.entries(manifest.files)) {
    const path = join(VENDOR_DIR, local)
    const got = existsSync(path) ? sha256(readFileSync(path)) : "(missing)"
    if (got !== want) {
      console.error(`✗ ${local} differs from upstream ${manifest.commit.slice(0, 7)} — vendored files must not be edited`)
      bad++
    }
  }
  if (bad) process.exit(1)
  console.log(`✓ ${Object.keys(manifest.files).length} vendored files match ${manifest.commit.slice(0, 7)}`)

  // Informational only: has main changed any vendored file since the pin?
  try {
    const changed = gh([`repos/${REPO}/compare/${manifest.commit}...main`, "--jq", ".files[].filename"])
      .toString()
      .trim()
      .split("\n")
    const upstreamPaths = new Set(Object.values(FILES))
    const stale = changed.filter((f) => upstreamPaths.has(f))
    if (stale.length) console.log(`ℹ changed on main since the pin: ${stale.join(", ")} — run with --ref main to update`)
    else console.log("ℹ no vendored file has changed on main since the pin")
  } catch {
    console.log("ℹ could not reach GitHub to look for newer upstream commits")
  }
}

function sync(ref) {
  const commit = resolveRef(ref)
  const files = {}
  for (const [local, upstream] of Object.entries(FILES)) {
    const buf = gh([`repos/${REPO}/contents/${upstream}?ref=${commit}`, "-H", "Accept: application/vnd.github.raw"])
    const path = join(VENDOR_DIR, local)
    mkdirSync(dirname(path), { recursive: true })
    writeFileSync(path, buf)
    files[local] = { upstream, sha256: sha256(buf) }
    console.log(`  ${local}  ← ${upstream}`)
  }
  const manifest = { repo: REPO, commit, fetchedAt: new Date().toISOString().slice(0, 10), files }
  writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2) + "\n")
  console.log(`✓ vendored ${Object.keys(files).length} files at ${commit.slice(0, 7)}`)
}

const args = process.argv.slice(2)
if (args.includes("--check")) {
  check()
} else {
  const i = args.indexOf("--ref")
  const ref = i >= 0 ? args[i + 1] : readManifest()?.commit
  if (!ref) {
    console.error("No pinned commit yet — pass --ref <branch|sha>.")
    process.exit(1)
  }
  sync(ref)
}
