import { atom } from "nanostores"

export const $selectedIso = atom<string>("eng")

export function setIso(iso: string) {
  $selectedIso.set(iso)
}

export function initIsoFromUrl() {
  if (typeof window === "undefined") return
  const segs = window.location.pathname.split("/").filter(Boolean)
  if (segs.length >= 1 && segs[0].length === 3) {
    $selectedIso.set(segs[0])
  }
}
