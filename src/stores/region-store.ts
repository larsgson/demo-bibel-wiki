import { atom } from "nanostores"
import { regionConfigs } from "../lib/data/region-config"

/**
 * Active region (country-level entry point).
 *
 * Regional entry points are keyed by a 2-letter code (e.g. `mx`, `se`, `dk`,
 * `in`) and surfaced as subdomains (mx.bibel.wiki) and/or the path `/r/<code>`.
 * Region drives *context* (default language, which languages the picker
 * surfaces first) — NOT the route structure, so the existing `/:iso/`, `/l/`
 * routes are untouched.
 *
 * The active region resolves in priority order:
 *   1. subdomain host   (mx.bibel.wiki)        — explicit entry
 *   2. `/r/<code>` path  (direct/SEO visit, or edge rewrite target)
 *   3. `?region=<code>`  query
 *   4. saved preference  (localStorage)
 *
 * This works client-side today (zero infra). When a Netlify Edge Function later
 * rewrites `mx.bibel.wiki/*` → `/r/mx/*`, the browser URL stays on the
 * subdomain, so resolution #1 still catches it; direct `/r/mx` visits hit #2.
 */

export interface RegionEntry {
  code: string
  name: { en: string; es: string }
  /** Default primary language (ISO 639-3) when entering via this region. */
  defaultLang: string
}

// Known regional entry points — auto-registered from config/regions/*.toml.
// Dropping in a new <code>.toml lights up its subdomain + landing.
export const KNOWN_REGIONS: Record<string, RegionEntry> = Object.fromEntries(
  regionConfigs.map((rc) => [
    rc.code,
    { code: rc.code, name: rc.name, defaultLang: rc.defaultLanguage },
  ]),
)

const STORAGE_KEY = "bw-active-region"

export const $activeRegion = atom<string | null>(null)

export function isKnownRegion(code: string | null | undefined): code is string {
  return !!code && Object.prototype.hasOwnProperty.call(KNOWN_REGIONS, code)
}

function fromSubdomain(): string | null {
  if (typeof window === "undefined") return null
  const host = window.location.hostname
  if (host === "localhost" || /^[0-9.]+$/.test(host)) return null // dev / IP
  const parts = host.split(".")
  if (parts.length < 3) return null // apex (bibel.wiki) — no region subdomain
  return isKnownRegion(parts[0]) ? parts[0] : null
}

function fromPath(): string | null {
  if (typeof window === "undefined") return null
  const segs = window.location.pathname.split("/").filter(Boolean)
  return segs[0] === "r" && isKnownRegion(segs[1]) ? segs[1] : null
}

function fromQuery(): string | null {
  if (typeof window === "undefined") return null
  const q = new URLSearchParams(window.location.search).get("region")
  return isKnownRegion(q) ? q : null
}

function fromStorage(): string | null {
  if (typeof localStorage === "undefined") return null
  const s = localStorage.getItem(STORAGE_KEY)
  return isKnownRegion(s) ? s : null
}

/** Resolve the active region code from all sources, in priority order. */
export function resolveRegionCode(): string | null {
  return fromSubdomain() ?? fromPath() ?? fromQuery() ?? fromStorage()
}

export function setRegion(code: string | null) {
  const next = isKnownRegion(code) ? code : null
  $activeRegion.set(next)
  if (typeof localStorage !== "undefined") {
    if (next) localStorage.setItem(STORAGE_KEY, next)
    else localStorage.removeItem(STORAGE_KEY)
  }
  if (typeof document !== "undefined") {
    if (next) document.documentElement.dataset.region = next
    else delete document.documentElement.dataset.region
  }
}

export function initRegion() {
  if (typeof window === "undefined") return
  const code = resolveRegionCode()
  $activeRegion.set(code)
  if (typeof document !== "undefined") {
    if (code) document.documentElement.dataset.region = code
    else delete document.documentElement.dataset.region
  }
  // Persist only an *explicitly signalled* region (subdomain/path/query), so it
  // carries to later apex visits. Don't re-persist when only saved-pref matched.
  if (code && (fromSubdomain() || fromPath() || fromQuery())) {
    if (typeof localStorage !== "undefined") localStorage.setItem(STORAGE_KEY, code)
  }
}

export function activeRegionInfo(): RegionEntry | null {
  const code = $activeRegion.get()
  return code ? KNOWN_REGIONS[code] ?? null : null
}

// Resolve once on module load (client only), like the language/iso stores.
if (typeof window !== "undefined") initRegion()
