import { atom } from "nanostores"

/**
 * Whether the Bible reader shows the two-language parallel/interlinear view
 * instead of the normal single-language chapter text. Persisted like
 * $uiLevel — book/chapter position itself already persists independently
 * (see position.ts's saveLastPosition), so this only needs to remember the
 * view choice on top of that.
 */

const STORAGE_KEY = "bw-parallel-view"

function load(): boolean {
  if (typeof localStorage === "undefined") return false
  return localStorage.getItem(STORAGE_KEY) === "1"
}

export const $parallelView = atom<boolean>(load())

export function setParallelView(on: boolean) {
  $parallelView.set(on)
  if (typeof localStorage !== "undefined") {
    localStorage.setItem(STORAGE_KEY, on ? "1" : "0")
  }
}

export function toggleParallelView() {
  setParallelView(!$parallelView.get())
}
