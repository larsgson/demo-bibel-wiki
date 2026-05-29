import fs from "node:fs"
import path from "node:path"
import siteConfig from "../../../site.config.json"
import type {
  TemplateStructure,
  TemplateCategory,
  TemplateStory,
  LocaleData,
  CategoryMeta,
  StoryMeta,
} from "./types"

const SRC_TEMPLATES_DIR = path.join(process.cwd(), "src/data/content/templates")
const PUBLIC_TEMPLATES_DIR = path.join(process.cwd(), "public/templates")

// --- Template Discovery ---

function discoverTemplates(): string[] {
  if (!fs.existsSync(SRC_TEMPLATES_DIR)) return []
  return fs.readdirSync(SRC_TEMPLATES_DIR).filter((d) => {
    const fullPath = path.join(SRC_TEMPLATES_DIR, d)
    return (
      fs.statSync(fullPath).isDirectory() &&
      fs.existsSync(path.join(fullPath, "index.toml"))
    )
  })
}


// --- Locale Data ---

export function loadLocaleData(
  templateName: string,
  iso3: string,
): LocaleData | null {
  const filePath = path.join(SRC_TEMPLATES_DIR, templateName, "locales", `${iso3}.toml`)
  if (!fs.existsSync(filePath)) return null

  const content = fs.readFileSync(filePath, "utf-8")
  const lines = content.split("\n")

  let bookTitle = ""
  const categories: Record<string, CategoryMeta> = {}
  const stories: Record<string, StoryMeta> = {}
  const sections: Record<string, Record<string, string>> = {}

  let currentSection = ""
  const pendingValues: Record<string, string> = {}

  function flushSection() {
    if (!currentSection) return

    if (!currentSection.includes(".")) {
      if (pendingValues.title) {
        categories[currentSection] = {
          title: pendingValues.title,
          description: pendingValues.description || "",
        }
      }
      return
    }

    const parts = currentSection.split(".")

    if (parts.length === 2) {
      // Use compound key "catId.storyNum" to avoid collisions across categories
      const storyKey = `${parts[0]}.${parts[1]}`
      stories[storyKey] = {
        title: pendingValues.title || "",
        description: pendingValues.description || "",
      }
    } else if (parts.length === 3) {
      // Use compound key "catId.storyNum" for the story, keep verse key as-is
      const storyKey = `${parts[0]}.${parts[1]}`
      const verseKey = parts[2]
      if (pendingValues.p_hd) {
        if (!sections[storyKey]) sections[storyKey] = {}
        sections[storyKey][verseKey] = pendingValues.p_hd
      }
    }
  }

  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith("#")) continue

    const sectionMatch = trimmed.match(/^\[([^\]]+)\]$/)
    if (sectionMatch) {
      flushSection()
      currentSection = sectionMatch[1]
      for (const key of Object.keys(pendingValues)) {
        delete pendingValues[key]
      }
      continue
    }

    const kvMatch = trimmed.match(/^(\w+)\s*=\s*"((?:[^"\\]|\\.)*)"/)
    if (kvMatch) {
      const key = kvMatch[1]
      const value = kvMatch[2].replace(/\\"/g, '"')

      if (!currentSection && key === "title") {
        bookTitle = value
      }

      pendingValues[key] = value
    }
  }

  flushSection()

  return { bookTitle, categories, stories, sections }
}

export function loadLocaleDataWithFallback(
  templateName: string,
  iso3: string,
  fallbackLanguages: string[],
): LocaleData | null {
  const own = loadLocaleData(templateName, iso3)
  if (own) return own
  for (const fb of fallbackLanguages) {
    if (fb === iso3) continue
    const fbData = loadLocaleData(templateName, fb)
    if (fbData) return fbData
  }
  if (iso3 !== "eng" && !fallbackLanguages.includes("eng")) {
    return loadLocaleData(templateName, "eng")
  }
  return null
}

// --- Template Structure ---

export function loadTemplateStructure(
  templateName: string,
): TemplateStructure | null {
  const templateDir = path.join(SRC_TEMPLATES_DIR, templateName)
  const rootToml = path.join(templateDir, "index.toml")
  if (!fs.existsSync(rootToml)) return null

  const rootContent = fs.readFileSync(rootToml, "utf-8")

  let layoutTheme: string | null = null
  const themeMatch = rootContent.match(/^layout_theme\s*=\s*"([^"]+)"/m)
  if (themeMatch) layoutTheme = themeMatch[1]

  // Parse [images] config (base_url, thumbs_url, thumbs_resize)
  let imageConfig: import("./types").ImageConfig | null = null
  const imagesBlock = rootContent.match(
    /\[images\]\s*\n((?:\s*(?:\w+\s*=\s*"[^"]*"|#[^\n]*)\s*\n?)*)/,
  )
  if (imagesBlock) {
    const baseUrlMatch = imagesBlock[1].match(/base_url\s*=\s*"([^"]+)"/)
    if (baseUrlMatch) {
      imageConfig = { base_url: baseUrlMatch[1] }
      const thumbsUrlMatch = imagesBlock[1].match(/thumbs_url\s*=\s*"([^"]+)"/)
      if (thumbsUrlMatch) imageConfig.thumbs_url = thumbsUrlMatch[1]
      const thumbsResizeMatch = imagesBlock[1].match(/thumbs_resize\s*=\s*"([^"]+)"/)
      if (thumbsResizeMatch) imageConfig.thumbs_resize = thumbsResizeMatch[1]
      const pathPatternMatch = imagesBlock[1].match(/path_pattern\s*=\s*"([^"]+)"/)
      if (pathPatternMatch) imageConfig.path_pattern = pathPatternMatch[1]
      const thumbsPatternMatch = imagesBlock[1].match(/thumbs_pattern\s*=\s*"([^"]+)"/)
      if (thumbsPatternMatch) imageConfig.thumbs_pattern = thumbsPatternMatch[1]
      const mediumPatternMatch = imagesBlock[1].match(/medium_pattern\s*=\s*"([^"]+)"/)
      if (mediumPatternMatch) imageConfig.medium_pattern = mediumPatternMatch[1]
    }
  }

  // Apply site.config.json imageOverrides (takes precedence over template's index.toml)
  const overrides = (siteConfig as any).imageOverrides?.[templateName]
  if (overrides) {
    if (!imageConfig && overrides.base_url) {
      imageConfig = { base_url: overrides.base_url }
    }
    if (imageConfig) {
      if (overrides.base_url) imageConfig.base_url = overrides.base_url
      if (overrides.medium_pattern) imageConfig.medium_pattern = overrides.medium_pattern
      if (overrides.thumbs_pattern) imageConfig.thumbs_pattern = overrides.thumbs_pattern
    }
  }

  let coverImage = ""
  const imgFilenameMatch = rootContent.match(
    /\[image\]\s*\n\s*filename\s*=\s*"([^"]+)"/,
  )
  if (imgFilenameMatch) {
    coverImage = imgFilenameMatch[1]
  }

  const categoryEntries: Array<{ id: string; image: string }> = []

  // Support simple array format: categories = ["01", "02", ...]
  const simpleArrayMatch = rootContent.match(/^categories\s*=\s*\[([\s\S]*?)\]/m)
  if (simpleArrayMatch) {
    const items = simpleArrayMatch[1].match(/"([^"]+)"/g)
    if (items) {
      for (const item of items) {
        const id = item.replace(/"/g, "")
        categoryEntries.push({ id, image: "" })
      }
    }
  }

  // Also support [[categories]] array-of-tables format
  let inCategory = false
  let catId = ""
  let catImage = ""

  for (const line of rootContent.split("\n")) {
    const trimmed = line.trim()
    if (trimmed === "[[categories]]") {
      if (inCategory && catId) {
        categoryEntries.push({ id: catId, image: catImage })
      }
      inCategory = true
      catId = ""
      catImage = ""
      continue
    }
    if (inCategory) {
      const idMatch = trimmed.match(/^id\s*=\s*"([^"]+)"/)
      if (idMatch) catId = idMatch[1]
      const imgMatch = trimmed.match(/^image\s*=\s*"([^"]+)"/)
      if (imgMatch) catImage = imgMatch[1]
    }
  }
  if (inCategory && catId) {
    categoryEntries.push({ id: catId, image: catImage })
  }

  const categories: TemplateCategory[] = []

  for (const cat of categoryEntries) {
    const catToml = path.join(templateDir, cat.id, "index.toml")
    if (!fs.existsSync(catToml)) continue

    const catContent = fs.readFileSync(catToml, "utf-8")
    const stories: TemplateStory[] = []

    let inStory = false
    let storyId = ""
    let storyImage = ""

    for (const line of catContent.split("\n")) {
      const trimmed = line.trim()
      if (trimmed === "[[stories]]") {
        if (inStory && storyId) {
          stories.push({
            id: storyId,
            chapter: parseInt(storyId, 10),
            image: storyImage,
          })
        }
        inStory = true
        storyId = ""
        storyImage = ""
        continue
      }
      if (inStory) {
        const idMatch = trimmed.match(/^id\s*=\s*"([^"]+)"/)
        if (idMatch) storyId = idMatch[1]
        const imgMatch = trimmed.match(/^image\s*=\s*"([^"]+)"/)
        if (imgMatch) storyImage = imgMatch[1]
      }
    }
    if (inStory && storyId) {
      stories.push({
        id: storyId,
        chapter: parseInt(storyId, 10),
        image: storyImage,
      })
    }

    categories.push({ id: cat.id, image: cat.image, stories })
  }

  if (!coverImage && categories.length > 0 && categories[0].stories.length > 0) {
    coverImage = categories[0].stories[0].image
  }

  return { name: templateName, image: coverImage, layoutTheme, imageConfig, categories }
}

export function loadAllTemplates(): Record<string, TemplateStructure> {
  const result: Record<string, TemplateStructure> = {}
  for (const name of discoverTemplates()) {
    const ts = loadTemplateStructure(name)
    if (ts) result[name] = ts
  }
  return result
}

// --- Markdown Content ---

export function loadMarkdownContent(
  templateName: string,
  categoryId: string,
  storyId: string,
): string | null {
  const mdPath = path.join(SRC_TEMPLATES_DIR, templateName, categoryId, `${storyId}.md`)
  if (!fs.existsSync(mdPath)) return null
  return fs.readFileSync(mdPath, "utf-8")
}

// --- All Locale Data (for a template) ---

export function loadAllLocaleData(
  templateName: string,
): Record<string, LocaleData> {
  const localesDir = path.join(SRC_TEMPLATES_DIR, templateName, "locales")
  if (!fs.existsSync(localesDir)) return {}
  const result: Record<string, LocaleData> = {}
  for (const file of fs.readdirSync(localesDir)) {
    if (!file.endsWith(".toml")) continue
    const iso3 = file.replace(".toml", "")
    const data = loadLocaleData(templateName, iso3)
    if (data) result[iso3] = data
  }
  return result
}

// --- Missing Stories ---

/**
 * Returns a set of story IDs (within a template) that have no markdown content.
 * Used to dim/badge missing stories in the navigation grid.
 */
export function findMissingStoryIds(templateName: string): string[] {
  const structure = loadTemplateStructure(templateName)
  if (!structure) return []
  const missing: string[] = []
  for (const cat of structure.categories) {
    for (const story of cat.stories) {
      const content = loadMarkdownContent(templateName, cat.id, story.id)
      if (!content) missing.push(`${cat.id}/${story.id}`)
    }
  }
  return missing
}

// --- Story Testament Requirements ---

/**
 * For each story in a template, extract which testaments (ot/nt) its
 * [[ref:...]] markers reference. Returns a map of "catId/storyId" → ["nt"] or ["ot"] or ["nt","ot"].
 */
export function extractStoryTestaments(
  templateName: string,
): Record<string, string[]> {
  const structure = loadTemplateStructure(templateName)
  if (!structure) return {}

  const NT_BOOKS = new Set([
    "MAT", "MRK", "LUK", "JHN", "JOH", "ACT", "ROM", "1CO", "2CO",
    "GAL", "EPH", "PHP", "COL", "1TH", "2TH", "1TI", "2TI", "TIT",
    "PHM", "HEB", "JAS", "1PE", "2PE", "1JN", "2JN", "3JN", "JUD", "REV",
  ])

  const result: Record<string, string[]> = {}

  for (const cat of structure.categories) {
    for (const story of cat.stories) {
      const content = loadMarkdownContent(templateName, cat.id, story.id)
      if (!content) continue

      const testaments = new Set<string>()
      const refPattern = /\[\[ref:([A-Z0-9]+)\s/gi
      let match
      while ((match = refPattern.exec(content)) !== null) {
        const book = match[1].toUpperCase()
        testaments.add(NT_BOOKS.has(book) ? "nt" : "ot")
      }

      if (testaments.size > 0) {
        result[`${cat.id}/${story.id}`] = Array.from(testaments).sort()
      }
    }
  }

  return result
}

// --- Timing Data ---

export function loadTimingData(
  templateName: string,
  distinctId: string,
  iso3: string,
): Record<string, any> | null {
  const categories = ["with-timecode", "audio-with-timecode"]
  for (const category of categories) {
    const timingPath = path.join(
      PUBLIC_TEMPLATES_DIR,
      templateName,
      "ALL-timings",
      "nt",
      category,
      iso3,
      distinctId,
      "timing.json",
    )
    if (!fs.existsSync(timingPath)) continue
    try {
      return JSON.parse(fs.readFileSync(timingPath, "utf-8"))
    } catch {
      continue
    }
  }
  return null
}

export function getTemplateThemeCSS(templateName: string): string {
  const tomlPath = path.join(SRC_TEMPLATES_DIR, templateName, "index.toml")
  if (!fs.existsSync(tomlPath)) return ""
  const content = fs.readFileSync(tomlPath, "utf-8")
  const themeMatch = content.match(/^layout_theme\s*=\s*"([^"]+)"/m)
  if (!themeMatch) return ""
  const cssPath = path.join(SRC_TEMPLATES_DIR, templateName, themeMatch[1])
  return fs.existsSync(cssPath) ? fs.readFileSync(cssPath, "utf-8") : ""
}
