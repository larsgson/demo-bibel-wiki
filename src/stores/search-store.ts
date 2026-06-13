import { atom } from "nanostores"

export type SearchMode = "free" | "premium"

export const $searchMode = atom<SearchMode>("free")

export function initSearchMode() {
  if (typeof window === "undefined") return
  const saved = localStorage.getItem("search_mode")
  if (saved === "premium") $searchMode.set("premium")
}

export function setSearchMode(mode: SearchMode) {
  $searchMode.set(mode)
  if (typeof window !== "undefined") localStorage.setItem("search_mode", mode)
}
