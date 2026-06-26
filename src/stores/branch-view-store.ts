import { atom } from "nanostores"

// Which top-level view the right pane shows
export type ActivePane = "bible" | "story" | "study" | "branch"

export interface PaneState {
  pane: ActivePane
  branchKey?: string
  scrollToIndex?: number | null
}

// Default landing pane. A `?pane=` URL signal wins (so navigating to the study
// pane from another page lands directly on it); otherwise it depends on the UI
// level — Simple has no Bible pane so it lands on the stories landing, while
// Standard/Study land on the Bible reader.
function defaultPane(): PaneState {
  if (typeof window !== "undefined") {
    const params = new URLSearchParams(window.location.search)
    const pane = params.get("pane")
    if (pane === "study") return { pane: "study" }
    if (pane === "branch") {
      return { pane: "branch", branchKey: params.get("branch") || undefined,
               scrollToIndex: params.get("i") ? Number(params.get("i")) : null }
    }
  }
  if (typeof localStorage !== "undefined") {
    const lvl = localStorage.getItem("bw-ui-level")
    if (lvl === "2" || lvl === "3") return { pane: "bible" }
  }
  return { pane: "story" }
}

export const $activePane = atom<PaneState>(defaultPane())

function emitPaneChange(state: PaneState) {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("pane-changed", { detail: state }))
  }
}

// Each Astro island gets its own atom instance. This syncs the local atom
// from the global CustomEvent so all islands stay in step.
export function initPaneListener() {
  if (typeof window === "undefined") return
  window.addEventListener("pane-changed", ((e: CustomEvent<PaneState>) => {
    $activePane.set(e.detail)
  }) as EventListener)
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
