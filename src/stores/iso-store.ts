import { atom } from "nanostores"

const STORAGE_KEY = "selected_iso"

export const $selectedIso = atom<string>("eng")

export function setIso(iso: string) {
  $selectedIso.set(iso)
  if (typeof window !== "undefined") localStorage.setItem(STORAGE_KEY, iso)
}

export function initIsoFromUrl() {
  if (typeof window === "undefined") return
  const segs = window.location.pathname.split("/").filter(Boolean)
  if (segs.length >= 1 && segs[0].length === 3) {
    setIso(segs[0])
  } else {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved) $selectedIso.set(saved)
  }
}
