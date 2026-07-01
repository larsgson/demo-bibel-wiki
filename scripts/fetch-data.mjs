#!/usr/bin/env node
/**
 * Fetch build-time data:
 *   1. PKF data from the se-regional-data GitHub release
 *   2. BSB (Berean Standard Bible) from BSB-publishing/bsb-data-output
 *
 * Run via: pnpm fetch:data   (or automatically as prebuild)
 *
 * Environment variables:
 *   DATA_REPO          — GitHub repo for PKF (default: larsgson/se-regional-data)
 *   DATA_RELEASE_TAG   — Release tag (default: "latest")
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
const BSB_DIR = "public/bsb"
const BSB_REPO = "BSB-publishing/bsb-data-output"
const BSB_BRANCH = "main"

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

// ── 2. BSB data ──

if (existsSync(join(BSB_DIR, "catalog.json"))) {
  console.log(`BSB data already present at ${BSB_DIR}/catalog.json — skipping.`)
} else {
  console.log(`\n── Fetching BSB data from ${BSB_REPO} ──\n`)
  mkdirSync(BSB_DIR, { recursive: true })

  const rawBase = `https://raw.githubusercontent.com/${BSB_REPO}/${BSB_BRANCH}/base`

  // Fetch headings.jsonl
  console.log("  Downloading headings.jsonl...")
  const headingsRes = await fetch(`${rawBase}/headings.jsonl`)
  if (!headingsRes.ok) throw new Error(`Failed to fetch headings: ${headingsRes.status}`)
  const headingsText = await headingsRes.text()
  writeFileSync(join(BSB_DIR, "headings.jsonl"), headingsText)

  // Fetch display files list
  console.log("  Fetching book list...")
  const listRes = await fetch(
    `https://api.github.com/repos/${BSB_REPO}/contents/base/display`,
    { headers: { Accept: "application/vnd.github+json" } }
  )
  if (!listRes.ok) throw new Error(`Failed to list display dir: ${listRes.status}`)
  const files = await listRes.json()
  const bookFiles = files.filter((f) => f.name.endsWith(".jsonl") && f.name !== "stats.json")

  // Book name lookup (USFM code → full name / abbreviation)
  const BOOK_NAMES = {
    GEN:"Genesis",EXO:"Exodus",LEV:"Leviticus",NUM:"Numbers",DEU:"Deuteronomy",
    JOS:"Joshua",JDG:"Judges",RUT:"Ruth","1SA":"1 Samuel","2SA":"2 Samuel",
    "1KI":"1 Kings","2KI":"2 Kings","1CH":"1 Chronicles","2CH":"2 Chronicles",
    EZR:"Ezra",NEH:"Nehemiah",EST:"Esther",JOB:"Job",PSA:"Psalms",PRO:"Proverbs",
    ECC:"Ecclesiastes",SNG:"Song of Solomon",ISA:"Isaiah",JER:"Jeremiah",
    LAM:"Lamentations",EZK:"Ezekiel",DAN:"Daniel",HOS:"Hosea",JOL:"Joel",
    AMO:"Amos",OBA:"Obadiah",JON:"Jonah",MIC:"Micah",NAM:"Nahum",HAB:"Habakkuk",
    ZEP:"Zephaniah",HAG:"Haggai",ZEC:"Zechariah",MAL:"Malachi",
    MAT:"Matthew",MRK:"Mark",LUK:"Luke",JHN:"John",ACT:"Acts",ROM:"Romans",
    "1CO":"1 Corinthians","2CO":"2 Corinthians",GAL:"Galatians",EPH:"Ephesians",
    PHP:"Philippians",COL:"Colossians","1TH":"1 Thessalonians","2TH":"2 Thessalonians",
    "1TI":"1 Timothy","2TI":"2 Timothy",TIT:"Titus",PHM:"Philemon",HEB:"Hebrews",
    JAS:"James","1PE":"1 Peter","2PE":"2 Peter","1JN":"1 John","2JN":"2 John",
    "3JN":"3 John",JUD:"Jude",REV:"Revelation",
  }
  const BOOK_ABBR = {
    GEN:"Gen",EXO:"Exo",LEV:"Lev",NUM:"Num",DEU:"Deu",JOS:"Jos",JDG:"Jdg",RUT:"Rut",
    "1SA":"1Sa","2SA":"2Sa","1KI":"1Ki","2KI":"2Ki","1CH":"1Ch","2CH":"2Ch",
    EZR:"Ezr",NEH:"Neh",EST:"Est",JOB:"Job",PSA:"Psa",PRO:"Pro",ECC:"Ecc",SNG:"Sng",
    ISA:"Isa",JER:"Jer",LAM:"Lam",EZK:"Ezk",DAN:"Dan",HOS:"Hos",JOL:"Jol",AMO:"Amo",
    OBA:"Oba",JON:"Jon",MIC:"Mic",NAM:"Nam",HAB:"Hab",ZEP:"Zep",HAG:"Hag",ZEC:"Zec",
    MAL:"Mal",MAT:"Mat",MRK:"Mrk",LUK:"Luk",JHN:"Jhn",ACT:"Act",ROM:"Rom",
    "1CO":"1Co","2CO":"2Co",GAL:"Gal",EPH:"Eph",PHP:"Php",COL:"Col",
    "1TH":"1Th","2TH":"2Th","1TI":"1Ti","2TI":"2Ti",TIT:"Tit",PHM:"Phm",HEB:"Heb",
    JAS:"Jas","1PE":"1Pe","2PE":"2Pe","1JN":"1Jn","2JN":"2Jn","3JN":"3Jn",
    JUD:"Jud",REV:"Rev",
  }

  // Build catalog and chapter files from display JSONL
  const documents = []
  const chaptersDir = join(BSB_DIR, "chapters")

  for (const file of bookFiles) {
    const bookCode = file.name.replace(".jsonl", "")
    process.stdout.write(`  ${bookCode}...`)

    const res = await fetch(file.download_url)
    if (!res.ok) {
      console.warn(` ⚠ failed (${res.status})`)
      continue
    }
    const text = await res.text()
    const lines = text.trim().split("\n").map((l) => JSON.parse(l))

    // Group verses by chapter
    const byChapter = {}
    for (const { c, v, w } of lines) {
      if (!byChapter[c]) byChapter[c] = {}
      byChapter[c][v] = w
    }

    // Write per-chapter JSON files
    const bookChapterDir = join(chaptersDir, bookCode)
    mkdirSync(bookChapterDir, { recursive: true })
    for (const [ch, verses] of Object.entries(byChapter)) {
      writeFileSync(
        join(bookChapterDir, `${bookCode}${ch}.json`),
        JSON.stringify({ eng: verses })
      )
    }

    // Build catalog entry
    const chapterNums = Object.keys(byChapter).map(Number).sort((a, b) => a - b)
    const versesByChapters = {}
    for (const ch of chapterNums) {
      versesByChapters[ch] = {}
      for (const v of Object.keys(byChapter[ch])) {
        versesByChapters[ch][v] = ""
      }
    }

    documents.push({
      id: `eng_bsb/${bookCode}`,
      bookCode,
      h: BOOK_NAMES[bookCode] ?? bookCode,
      toc: BOOK_NAMES[bookCode] ?? bookCode,
      toc2: BOOK_ABBR[bookCode] ?? bookCode,
      toc3: null,
      versesByChapters,
    })

    process.stdout.write(" ✓\n")
  }

  // Write catalog.json
  const catalog = {
    id: "eng_bsb",
    selectors: { lang: "eng", abbr: "bsb" },
    documents,
  }
  writeFileSync(join(BSB_DIR, "catalog.json"), JSON.stringify(catalog, null, 2))
  console.log(`  ✓ BSB data ready (${documents.length} books)`)
}

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
