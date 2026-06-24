import { atom } from "nanostores"
import type { Branch } from "../lib/api/types"

export interface BibleRef {
  book: string
  chapter: number
  verse?: number
}

const STORAGE_KEY = "bw-bible-highlights"

function loadFromStorage(): Map<string, number[]> {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY)
    if (!raw) return new Map()
    const entries: [string, number[]][] = JSON.parse(raw)
    return new Map(entries)
  } catch {
    return new Map()
  }
}

function saveToStorage(map: Map<string, number[]>) {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify([...map.entries()]))
  } catch {}
}

// Map of "BOOK:CHAPTER" → verse numbers (empty array means whole chapter)
export const $bibleHighlights = atom<Map<string, number[]>>(
  typeof sessionStorage !== "undefined" ? loadFromStorage() : new Map()
)

const PATH_RE = /\/scripture\/(?:ot|nt)\/([A-Z0-9]{3})\/(\d+)(?:\/(\d+))?/

function parseRef(primaryPath: string): BibleRef | null {
  const m = PATH_RE.exec(primaryPath)
  if (!m) return null
  return {
    book: m[1],
    chapter: parseInt(m[2], 10),
    verse: m[3] ? parseInt(m[3], 10) : undefined,
  }
}

export function extractBibleHighlights(branches: Branch[]) {
  const map = new Map<string, number[]>()
  for (const branch of branches) {
    for (const item of branch.items) {
      const ref = parseRef(item.primary_path)
      if (!ref) continue
      const key = `${ref.book}:${ref.chapter}`
      const existing = map.get(key) ?? []
      if (ref.verse && !existing.includes(ref.verse)) existing.push(ref.verse)
      map.set(key, existing)
    }
  }
  if (map.size > 0) {
    const prev = $bibleHighlights.get()
    const merged = new Map(prev)
    for (const [k, verses] of map) {
      const existing = merged.get(k) ?? []
      for (const v of verses) {
        if (!existing.includes(v)) existing.push(v)
      }
      merged.set(k, existing)
    }
    $bibleHighlights.set(merged)
    saveToStorage(merged)
  }
}

export function clearBibleHighlights() {
  $bibleHighlights.set(new Map())
  try { sessionStorage.removeItem(STORAGE_KEY) } catch {}
}
