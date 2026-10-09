/**
 * Vernacular font loading for surfaces that show a language's text OUTSIDE
 * the Bible reader's `#container` scope (which gets its font for free from
 * the `delta.css` `<link>` — see sofria/styles.ts): the reader's topbar and
 * the Bible picker, and the story reader. The story reader can show TWO
 * languages side by side (primary + secondary), so each active language
 * needs its own, non-colliding `@font-face`.
 *
 * Strategy: fetch the language's `delta.css` (path from info.json's
 * `style_delta`), pull out only the `@font-face` rules (ignore the rest —
 * theme colours scoped to `#container`), rename the family to a per-iso-unique
 * name, resolve every relative `url(...)` against the stylesheet URL (fonts
 * live at `../../_fonts/…`, and once extracted they would otherwise resolve
 * against the *document*), and inject as a `<style>` tag. Returns the family
 * name to apply via inline style / CSS custom property; null when the
 * language has no real `@font-face` (system-ui only, or no PKF data at all).
 */

import { loadPkfInfo, pkfStyleUrls } from "./pkf-info"

const FONT_FACE_RE = /@font-face\s*\{[^}]*\}/g
const FAMILY_RE = /font-family\s*:\s*([^;}]+)(;|(?=\}))/
const URL_RE = /url\(\s*(['"]?)([^'")]+)\1\s*\)/g

function familyName(iso: string): string {
  return `vf-${iso}`
}

/** Pure: the `@font-face` rules of `css`, renamed to `family`, with every
 *  `url(...)` made absolute against `cssUrl` (which must itself be absolute).
 *  Empty string when there are none. */
export function extractFontFaces(css: string, cssUrl: string, family: string): string {
  const faces = css.match(FONT_FACE_RE)
  if (!faces?.length) return ""
  return faces
    .map((block) =>
      block
        .replace(FAMILY_RE, `font-family: ${family}$2`)
        .replace(URL_RE, (_m, quote: string, path: string) => `url(${quote}${new URL(path, cssUrl).href}${quote})`),
    )
    .join("\n")
}

const cache = new Map<string, Promise<string | null>>()

/** Fetch + inject this language's font-face rules once, returning the family
 *  name to use (or null if there's nothing but the system-ui fallback). */
export function loadVernacularFontFace(iso: string): Promise<string | null> {
  const cached = cache.get(iso)
  if (cached) return cached

  const p = (async () => {
    const info = await loadPkfInfo(iso)
    if (!info) return null
    const cssUrl = new URL(pkfStyleUrls(iso, info).at(-1)!, window.location.href).href
    const resp = await fetch(cssUrl)
    if (!resp.ok) return null
    const family = familyName(iso)
    const faces = extractFontFaces(await resp.text(), cssUrl, family)
    if (!faces) return null

    const tag = document.createElement("style")
    tag.dataset.vernacularFont = iso
    tag.textContent = faces
    document.head.appendChild(tag)
    return family
  })().catch(() => null)

  cache.set(iso, p)
  return p
}
