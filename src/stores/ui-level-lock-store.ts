import { atom } from "nanostores"
import type { UILevel } from "./ui-level-store"

/**
 * UI-level-locked subdomains (pwa.<domain>) — force a specific UI level
 * (Standard/Study/Simple) with no way to reach any other level, while
 * otherwise behaving exactly like the main app: same routes, same
 * [iso]-prefixed language switching, same content. Modeled directly on
 * template-lock-store.ts's subdomain-detection pattern — see that file's
 * own comment for why routing itself needs no special Netlify handling
 * (no path/content differs here, only the forced level) and why this
 * exists purely for client-side chrome (the mode switcher) to detect
 * "we're locked" and suppress itself.
 *
 * Unlike template-lock (which only ever forces level 1, always a safe
 * localStorage fallback default), a non-1 forced level must also be
 * WRITTEN to localStorage, not just reflected in a DOM attribute — several
 * call sites (Reader.svelte's bibleAllowed(), ui-level-store.ts's own
 * load()) read `localStorage["bw-ui-level"]` directly, not any data-*
 * attribute, so a stale/absent stored level would otherwise leave the
 * Bible reader pane unreachable even though the chrome looks unlocked.
 * See the inline <head> script in BaseLayout.astro, which does that write
 * before this module (or any atom's own load()) ever runs.
 *
 * Case-insensitive subdomain -> forced UILevel.
 */
export const KNOWN_UI_LEVEL_LOCK_SUBDOMAINS: Record<string, UILevel> = {
  pwa: 2,
}

export const $lockedUiLevel = atom<UILevel | null>(null)

function fromSubdomain(): UILevel | null {
  if (typeof window === "undefined") return null
  const host = window.location.hostname
  if (host === "localhost" || /^[0-9.]+$/.test(host)) return null // dev / IP
  const parts = host.split(".")
  if (parts.length < 3) return null // apex (bibel.wiki) — no lock subdomain
  const sub = parts[0].toLowerCase()
  return Object.prototype.hasOwnProperty.call(KNOWN_UI_LEVEL_LOCK_SUBDOMAINS, sub)
    ? KNOWN_UI_LEVEL_LOCK_SUBDOMAINS[sub]
    : null
}

function fromQuery(): UILevel | null {
  if (typeof window === "undefined") return null
  const q = new URLSearchParams(window.location.search).get("uiLevelLock")?.toLowerCase()
  return q && Object.prototype.hasOwnProperty.call(KNOWN_UI_LEVEL_LOCK_SUBDOMAINS, q)
    ? KNOWN_UI_LEVEL_LOCK_SUBDOMAINS[q]
    : null
}

/** Resolve the locked UI level from explicit URL signals — subdomain
 *  (production) is the real entry point; a `?uiLevelLock=<sub>` query
 *  override lets this be tested against `localhost`, same purpose as
 *  template-lock-store.ts's `?templateLock=`. */
export function resolveLockedUiLevel(): UILevel | null {
  return fromSubdomain() ?? fromQuery()
}

export function initUiLevelLock() {
  if (typeof window === "undefined") return
  const level = resolveLockedUiLevel()
  $lockedUiLevel.set(level)
  if (typeof document !== "undefined") {
    if (level) document.documentElement.dataset.uiLevelLock = String(level)
    else delete document.documentElement.dataset.uiLevelLock
  }
}

// Resolve once on module load (client only), like template-lock-store.ts.
if (typeof window !== "undefined") initUiLevelLock()
