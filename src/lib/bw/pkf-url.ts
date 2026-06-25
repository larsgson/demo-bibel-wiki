/**
 * Resolve a `/pkf/...` path to the URL it should be fetched from.
 *
 * Set PUBLIC_PKF_BASE_URL (e.g. https://cdn.bibel.wiki) to serve .pkf data from
 * an external host (Cloudflare R2) instead of bundling the ~1.5 GB into the
 * deploy. When unset, falls back to the local in-deploy `/pkf` path, so nothing
 * breaks before the external host is configured.
 *
 * Works at build time and in the browser — PUBLIC_-prefixed vars are inlined by
 * Vite/Astro in both contexts. Used for local dev too: point it at the CDN to
 * skip the big local data download entirely.
 */
const BASE = (import.meta.env.PUBLIC_PKF_BASE_URL ?? "").replace(/\/+$/, "")

export function pkfUrl(path: string): string {
  const p = path.startsWith("/") ? path : `/${path}`
  return BASE ? `${BASE}${p}` : p
}
