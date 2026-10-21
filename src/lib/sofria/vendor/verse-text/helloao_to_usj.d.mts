// Types for the vendored helloao_to_usj.mjs (ours, not upstream; not in VENDOR.json).
export interface Usj {
  type: "USJ"
  version: string
  content: unknown[]
}
export function chapterToUsj(chapterJson: unknown, bookCode: string): Usj
export function mergeBookUsj(bookCode: string, chaptersJson: unknown[]): Usj
