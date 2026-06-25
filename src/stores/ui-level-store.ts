import { atom } from "nanostores"

export type UILevel = 1 | 2 | 3

const STORAGE_KEY = "bw-ui-level"

function load(): UILevel {
  if (typeof localStorage === "undefined") return 1
  const raw = localStorage.getItem(STORAGE_KEY)
  if (raw === "1" || raw === "2" || raw === "3") return Number(raw) as UILevel
  return 1
}

/** Read the current level from localStorage (cross-island safe — each island
 * gets its own atom instance, so read storage directly rather than the atom). */
export function getUILevel(): UILevel {
  return load()
}

export const $uiLevel = atom<UILevel>(load())

export function setUILevel(level: UILevel) {
  $uiLevel.set(level)
  if (typeof localStorage !== "undefined") {
    localStorage.setItem(STORAGE_KEY, String(level))
  }
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("ui-level-changed", { detail: level }))
  }
}
