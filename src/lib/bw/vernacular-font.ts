/**
 * Vernacular font loading for surfaces that show a language's text OUTSIDE
 * the Bible reader's `#container` scope (which gets its font for free from
 * the `bundle.css` `<link>` — see Reader.svelte). The story reader can show
 * TWO languages side by side (primary + secondary), so we can't just swap
 * one global stylesheet link the way the Bible reader does — each active
 * language needs its own, non-colliding `@font-face`.
 *
 * Strategy: fetch `<iso>/styles/bundle.css`, pull out only the `@font-face`
 * rules (ignore the rest — theme colours, layout, SAB app-shell styles that
 * don't apply here), rename the family to a per-iso-unique name, rewrite the
 * relative `url(./fonts/...)` paths to absolute CDN URLs (they resolve
 * against the *document*, not the original stylesheet, once extracted), and
 * inject as a scoped `<style>` tag. Returns the family name to apply via
 * inline style / CSS custom property; null when the language has no real
 * `@font-face` (system-ui-only bundle, or no bundle at all).
 */

import { pkfUrl } from "./pkf-url"

const FONT_FACE_RE = /@font-face\s*\{[^}]*\}/g
const FAMILY_RE = /font-family\s*:\s*([^;]+);/
const URL_RE = /url\(\s*(['"]?)\.\/fonts\//g

function familyName(iso: string): string {
  return `vf-${iso}`
}

const cache = new Map<string, Promise<string | null>>()

/** Fetch + inject this language's font-face rules once, returning the family
 *  name to use (or null if there's nothing but the system-ui fallback). */
export function loadVernacularFontFace(iso: string): Promise<string | null> {
  const cached = cache.get(iso)
  if (cached) return cached

  const p = fetch(pkfUrl(`/pkf/${iso}/styles/bundle.css`))
    .then((r) => (r.ok ? r.text() : null))
    .then((css) => {
      if (!css) return null
      const faces = css.match(FONT_FACE_RE)
      if (!faces?.length) return null

      const family = familyName(iso)
      const base = pkfUrl(`/pkf/${iso}/styles/`)
      const rewritten = faces
        .map((block) =>
          block
            .replace(FAMILY_RE, `font-family: ${family};`)
            .replace(URL_RE, (_m, quote) => `url(${quote}${base}fonts/`),
        )
        .join("\n")

      const tag = document.createElement("style")
      tag.dataset.vernacularFont = iso
      tag.textContent = rewritten
      document.head.appendChild(tag)
      return family
    })
    .catch(() => null)

  cache.set(iso, p)
  return p
}
