// Types for the vendored text_fingerprint.mjs (ours, not upstream; not in VENDOR.json).
export const TEXT_FP_VERSION: number
export const NAME_HEX: number
export function verseLine(verse: number | string, text: string): string | null
/** `verses`: "chapter:verse" -> verse text. Digests are 64-hex SHA-256. */
export function fingerprints(verses: Map<string, string>): Promise<{ book: string; chapters: Record<string, string> }>
export function fileHash(bookFp: string): string
