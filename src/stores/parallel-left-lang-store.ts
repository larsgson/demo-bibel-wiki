import { atom } from "nanostores"

/**
 * Which text the parallel view's LEFT panel shows: "original" (today's
 * default — Hebrew OT / Greek NT via shoresh.ts, resolved per-book by
 * ParallelView.svelte) or an ISO-639-3 code for a modern translation,
 * rendered the same way the right panel already is (chapter-store's
 * loadChapter). Persisted like $parallelView.
 */

const STORAGE_KEY = "bw-parallel-left-lang"

function load(): string {
  if (typeof localStorage === "undefined") return "original"
  return localStorage.getItem(STORAGE_KEY) || "original"
}

export const $parallelLeftLang = atom<string>(load())

export function setParallelLeftLang(lang: string) {
  $parallelLeftLang.set(lang)
  if (typeof localStorage !== "undefined") {
    localStorage.setItem(STORAGE_KEY, lang)
  }
}
