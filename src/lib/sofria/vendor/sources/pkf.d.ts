// Types for the vendored sources/pkf.js (ours, not upstream; not in VENDOR.json).
import type { SofriaDoc } from "../../types"
import type { RenderOptions } from "../render"

export function sliceChapter(bookDoc: SofriaDoc, chapter: number | string): SofriaDoc
export function optionsFromAppConfig(cfg?: unknown): { options: RenderOptions; warnings: string[] }
