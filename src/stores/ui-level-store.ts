import { atom } from "nanostores"
import { $activePane, showStory } from "./branch-view-store"

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

/**
 * Switch UI level, guarding the one incompatible transition: Simple mode has
 * no way to reach an arbitrary book/chapter on its own (its only entry point
 * is the curated story grid), so downgrading to it while the Bible pane is
 * open would strand the visitor on a screen Simple mode was never built for.
 * Confirm first, and on confirm hand back to the story pane — a lossless
 * move, since Reader.svelte remembers the chapter and resumes it on the way
 * back up to Standard/Study. Every other transition just switches directly.
 * Returns false if the visitor cancelled (callers can skip their own UI
 * updates in that case).
 */
export function requestUILevel(level: UILevel, confirmMessage: string): boolean {
  if (level === 1 && $activePane.get().pane === "bible") {
    if (typeof window !== "undefined" && !window.confirm(confirmMessage)) return false
    showStory()
  }
  setUILevel(level)
  return true
}
