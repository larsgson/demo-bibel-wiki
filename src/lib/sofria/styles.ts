/**
 * Stylesheets for rendered scripture (SAB DOM from render.js). The shared
 * `pkf/_styles/sab-scripture.css` is scoped to `#container`/`.reader-root`,
 * so it is linked once and left in place; a PKF language's `delta.css`
 * (fonts + colour palette) is swapped when the reader changes language.
 * The app's own additions are in ./sab-overlay.css, imported by the
 * components that show scripture.
 */
import { sabSharedStyleUrl } from "../bw/pkf-info"

const ATTR = "data-bw-sab-css"

const abs = (href: string) => new URL(href, document.baseURI).href

function addLink(href: string, kind: "shared" | "lang") {
  const el = document.createElement("link")
  el.rel = "stylesheet"
  el.href = href
  el.setAttribute(ATTR, kind)
  document.head.appendChild(el)
}

/**
 * Make sure the scripture stylesheets are on the page. With a language's
 * `pkfStyleUrls` (shared sheet first, then `delta.css`), that language's
 * sheets replace any other language's; without, only the shared sheet is
 * ensured and language sheets are left alone (story excerpts).
 */
export function ensureSabStyles(styleUrls?: string[]): void {
  if (typeof document === "undefined") return
  const [shared = sabSharedStyleUrl(), ...lang] = (styleUrls ?? []).map(abs)
  const links = [...document.querySelectorAll<HTMLLinkElement>(`link[${ATTR}]`)]
  if (!links.some((l) => l.getAttribute(ATTR) === "shared")) addLink(shared, "shared")
  if (!styleUrls) return
  for (const l of links) if (l.getAttribute(ATTR) === "lang" && !lang.includes(l.href)) l.remove()
  for (const href of lang) if (!links.some((l) => l.href === href)) addLink(href, "lang")
}

/** Remove the language sheets (the reader is going away). */
export function clearSabLangStyles(): void {
  if (typeof document === "undefined") return
  document.querySelectorAll(`link[${ATTR}="lang"]`).forEach((el) => el.remove())
}
