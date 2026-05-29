import { getTextForReference } from "./bible-utils"
import type { Section, ParsedMarkdown } from "./types"

const replaceBibleReferences = (
  text: string,
  chapterText: Record<string, any>,
): string => {
  if (!text || !chapterText) return text

  const refPattern = /\[\[ref:\s*(.+?)\]\]/g
  let result = text
  let match

  while ((match = refPattern.exec(text)) !== null) {
    const fullMatch = match[0]
    const reference = match[1].trim()
    const extractedText = getTextForReference(reference, chapterText)
    if (extractedText) {
      result = result.replace(fullMatch, extractedText)
    }
  }

  return result
}

const resolveLocaleKey = (
  keyPath: string,
  localeData: Record<string, any> | null,
): string | null => {
  if (!localeData) return null
  const parts = keyPath.split(".")

  if (parts.length === 4 && parts[3] === "p_hd") {
    const storyKey = `${parts[0]}.${parts[1]}`
    const verseKey = parts[2]
    return localeData.sections?.[storyKey]?.[verseKey] || null
  }

  if (parts.length === 3) {
    const storyKey = `${parts[0]}.${parts[1]}`
    const key = parts[2]
    return localeData.stories?.[storyKey]?.[key] || null
  }

  if (parts.length === 2) {
    return localeData.categories?.[parts[0]]?.[parts[1]] || null
  }

  if (parts.length === 1) {
    if (keyPath === "title") return localeData.bookTitle || null
  }

  return null
}

const replaceLocaleMarkers = (
  text: string,
  localeData: Record<string, any> | null,
  fallbackLocale?: Record<string, any> | null,
): string => {
  if (!text || (!localeData && !fallbackLocale)) return text

  return text.replace(/\[\[t:([^\]]+)\]\]/g, (fullMatch, keyPath: string) => {
    const value = resolveLocaleKey(keyPath, localeData) || resolveLocaleKey(keyPath, fallbackLocale)
    return value || fullMatch
  })
}

export const parseMarkdownIntoSections = (
  markdown: string,
  chapterText: Record<string, any> = {},
  localeData: Record<string, any> | null = null,
  fallbackLocale?: Record<string, any> | null,
): ParsedMarkdown => {
  if (!markdown) {
    return { title: "", sections: [] }
  }

  const sections: Section[] = []
  const lines = markdown.split("\n")
  // Start with section 0 to capture content before the first image (rule 1)
  let currentSection: Section | null = { imageUrls: [], text: "", reference: "" }
  let storyTitle = ""

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim()

    if (line.startsWith("# ") && !storyTitle) {
      let titleText = line.substring(2).trim()
      if (titleText.includes("[[t:")) {
        titleText = replaceLocaleMarkers(titleText, localeData, fallbackLocale)
      }
      storyTitle = titleText
      continue
    }

    if (line.startsWith("[[story:") || line.startsWith("[[chapter:")) continue

    if (line.includes("[[t:")) {
      const resolved = replaceLocaleMarkers(line, localeData, fallbackLocale)
      if (!resolved.trim() || (resolved === line && !localeData && !fallbackLocale)) continue
      // ## title → story title (overrides # book-level title if present)
      if (resolved.startsWith("## ")) {
        storyTitle = resolved.replace(/^#+\s*/, "").trim()
        continue
      }
      // ### heading → section heading
      if (resolved.startsWith("### ") && currentSection) {
        currentSection.heading = resolved.replace(/^#+\s*/, "").trim()
        continue
      }
      if (currentSection && resolved.trim()) {
        currentSection.text +=
          (currentSection.text ? "\n" : "") + resolved.trim()
      }
      continue
    }

    if (line.startsWith("[[ref:")) {
      const refMatch = line.match(/\[\[ref:\s*(.+?)\]\]/)
      if (refMatch && currentSection) {
        currentSection.reference = refMatch[1].trim()
      }
      continue
    }

    const imageMatch = line.match(/!\[.*?\]\((.*?)\)/)
    if (imageMatch) {
      // If current section has no reference yet, add image to it (multiple images per section)
      if (currentSection && !currentSection.reference && !currentSection.text.trim()) {
        currentSection.imageUrls.push(imageMatch[1])
      } else {
        if (currentSection && (currentSection.text.trim() || currentSection.reference || currentSection.imageUrls.length > 0 || currentSection.heading)) {
          sections.push(currentSection)
        }
        currentSection = {
          imageUrls: [imageMatch[1]],
          text: "",
          reference: "",
        }
      }
    } else if (currentSection && line) {
      currentSection.text += (currentSection.text ? "\n" : "") + line
    }
  }

  if (currentSection) {
    sections.push(currentSection)
  }

  sections.forEach((section) => {
    if (section.text) {
      section.text = replaceBibleReferences(section.text, chapterText)
    }
  })

  sections.forEach((section) => {
    if (section.reference && (!section.text || section.text.trim() === "")) {
      const extractedText = getTextForReference(section.reference, chapterText)
      if (extractedText) {
        section.text = extractedText
      }
    }
  })

  return { title: storyTitle, sections }
}

export const getTitleFromMarkdown = (markdown: string): string => {
  if (!markdown || markdown.length === 0) return ""

  const found = markdown.match(/#[\s|\d|\.]*(.*)\n/)
  if (found?.[1]) return found[1]

  const found2 = markdown.match(/#\s*(\S.*)\n/)
  if (found2?.[1]) return found2[1]

  const found3 = markdown.match(/\s*(\S.*)\n/)
  if (found3?.[1]) return found3[1]

  const found4 = markdown.match(/.*(\w.*)\n/)
  return found4?.[1] || ""
}
