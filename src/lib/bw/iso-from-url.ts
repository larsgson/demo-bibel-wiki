export function getIsoFromUrl(fallback = "eng"): string {
  if (typeof window === "undefined") return fallback
  const params = new URLSearchParams(window.location.search)
  if (params.has("lang")) return params.get("lang")!
  const segs = window.location.pathname.split("/").filter(Boolean)
  if (segs.length >= 1 && /^[a-z]{3}$/.test(segs[0])) return segs[0]
  return fallback
}
