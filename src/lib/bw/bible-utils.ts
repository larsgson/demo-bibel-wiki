import type { ParsedReference } from "./types"

const BOOK_CODE_ALIASES: Record<string, string> = {
  JOH: "JHN",
}

export const normalizeBookCode = (bookCode: string): string => {
  if (!bookCode) return bookCode
  const upper = bookCode.toUpperCase()
  return BOOK_CODE_ALIASES[upper] || upper
}

const NT_BOOKS = [
  "MAT", "MRK", "LUK", "JHN", "JOH", "ACT", "ROM", "1CO", "2CO",
  "GAL", "EPH", "PHP", "COL", "1TH", "2TH", "1TI", "2TI", "TIT",
  "PHM", "HEB", "JAS", "1PE", "2PE", "1JN", "2JN", "3JN", "JUD", "REV",
]

export const getTestament = (bookCode: string): "nt" | "ot" => {
  return NT_BOOKS.includes(bookCode.toUpperCase()) ? "nt" : "ot"
}

export const parseReference = (reference: string): ParsedReference | null => {
  if (!reference) return null

  const match = reference.match(/^([A-Z0-9]+)\s+(\d+):(.+)$/i)
  if (!match) return null

  const book = normalizeBookCode(match[1])
  const chapter = parseInt(match[2], 10)
  const versePart = match[3]

  if (versePart.includes(",")) {
    const verses = versePart.split(",").map((v) => parseInt(v.trim(), 10))
    return { book, chapter, verses }
  }

  if (versePart.includes("-")) {
    const [start, end] = versePart.split("-").map((v) => parseInt(v.trim(), 10))
    return { book, chapter, verseStart: start, verseEnd: end }
  }

  const verse = parseInt(versePart, 10)
  return { book, chapter, verseStart: verse, verseEnd: verse }
}

export const extractVerses = (
  chapterData: any,
  verseStart?: number,
  verseEnd?: number,
  verses: number[] | null = null,
): string | null => {
  if (!chapterData) return null

  if (typeof chapterData === "string") return chapterData

  if (Array.isArray(chapterData)) {
    let selectedVerses
    if (verses && Array.isArray(verses)) {
      selectedVerses = chapterData.filter((v: any) => verses.includes(v.num))
    } else {
      selectedVerses = chapterData.filter(
        (v: any) => v.num >= (verseStart ?? 0) && v.num <= (verseEnd ?? Infinity),
      )
    }
    if (selectedVerses.length === 0) return null
    return selectedVerses.map((v: any) => v.text).join(" ").trim()
  }

  return null
}

export const splitReference = (reference: string): string[] => {
  if (!reference) return []

  const parts = reference.split(",").map((p) => p.trim())
  const results: string[] = []

  let currentBook: string | null = null
  let currentChapter: string | null = null

  parts.forEach((part) => {
    const bookMatch = part.match(/^([A-Z0-9]+)\s*(\d+):(.+)$/i)
    if (bookMatch) {
      currentBook = normalizeBookCode(bookMatch[1])
      currentChapter = bookMatch[2]
      results.push(`${currentBook} ${currentChapter}:${bookMatch[3]}`)
    } else {
      const chapterMatch = part.match(/^(\d+):(.+)$/)
      if (chapterMatch) {
        currentChapter = chapterMatch[1]
        results.push(`${currentBook} ${currentChapter}:${chapterMatch[2]}`)
      } else {
        results.push(`${currentBook} ${currentChapter}:${part}`)
      }
    }
  })

  return results
}

export const getTextForReference = (
  reference: string,
  chapterText: Record<string, any>,
): string | null => {
  if (!reference || !chapterText) return null

  const refs = splitReference(reference)
  if (refs.length === 0) return null

  const textParts: string[] = []

  for (const ref of refs) {
    const parsed = parseReference(ref)
    if (!parsed) continue

    const { book, chapter, verseStart, verseEnd, verses } = parsed
    const chapterKey = `${book}.${chapter}`

    if (!chapterText[chapterKey]) continue

    const extractedText = extractVerses(
      chapterText[chapterKey],
      verseStart,
      verseEnd,
      verses ?? null,
    )

    if (extractedText) {
      textParts.push(extractedText)
    }
  }

  return textParts.length > 0 ? textParts.join(" ") : null
}
