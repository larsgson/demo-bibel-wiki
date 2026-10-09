// Types for the vendored usj_to_sofria_native.mjs (ours, not upstream; not in VENDOR.json).
import type { SofriaDoc } from "../../types"
import type { Usj } from "./helloao_to_usj.mjs"

export function usjChapterToSofriaNative(usj: Usj, translation: { lang: string; abbr: string }): SofriaDoc
