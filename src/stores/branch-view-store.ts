import { atom } from "nanostores"

// Which top-level view the right pane shows
export type ActivePane = "bible" | "story" | "study" | "branch"

export interface PaneState {
  pane: ActivePane
  branchKey?: string
  scrollToIndex?: number | null
}

export const $activePane = atom<PaneState>({ pane: "bible" })

function emitPaneChange(state: PaneState) {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("pane-changed", { detail: state }))
  }
}

export function showBible() {
  const s = { pane: "bible" as const }
  $activePane.set(s)
  emitPaneChange(s)
}

export function showStory() {
  const s = { pane: "story" as const }
  $activePane.set(s)
  emitPaneChange(s)
}

export function showStudy() {
  const s = { pane: "study" as const }
  $activePane.set(s)
  emitPaneChange(s)
}

export function showBranch(branchKey: string, scrollToIndex: number | null = null) {
  const s = { pane: "branch" as const, branchKey, scrollToIndex }
  $activePane.set(s)
  emitPaneChange(s)
}
