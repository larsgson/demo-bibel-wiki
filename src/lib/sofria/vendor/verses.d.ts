// Types for the vendored verses.js (ours, not upstream; not in VENDOR.json).
import type { SofriaDoc } from "../types"

export type SofriaEntry =
  | { type: "verse"; verse: string; text: string; title?: true; display?: string; alt?: string; published?: true }
  | { type: "heading"; marker: string; text: string; verse: string | null; beforeVerse?: string | null }
  | { type: "intro"; marker: string; text: string }
  | { type: "note"; kind: string; caller: string; verse: string | null; text: string }
  | { type: "other"; marker: string; text: string }

export function extractEntries(doc: SofriaDoc): SofriaEntry[]
export function verseList(entries: SofriaEntry[]): Array<{ verse: string; text: string }>
export function verseMap(entries: SofriaEntry[]): Record<string, string>
