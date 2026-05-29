import { POPULAR_LANGUAGES } from "./popular-languages"

const prebuiltSet = new Set<string>(POPULAR_LANGUAGES as unknown as string[])

export function isDevMode(): boolean {
  if (typeof window === "undefined") return false
  return window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1"
}

/**
 * Builds a language-aware href for internal navigation.
 *
 * Pre-built (popular) languages have real static pages at /<lang>/<path>,
 * so links go there directly — works in both dev and production.
 *
 * Non-prebuilt languages use /l/<path>?lang=<lang> — the actual page
 * served in both environments. In production Netlify additionally makes
 * /<lang>/<path> work via transparent rewrite, but internal links don't
 * need that.
 *
 * Secondary languages are preserved as ?langs=fra,heb,arb
 */
export function buildLangHref(lang: string, path: string, secondaryLangs?: string[]): string {
  if (typeof window === "undefined") return `/${path}`

  const storyPath = `${path}`
  let href: string
  if (isDevMode()) {
    if (prebuiltSet.has(lang)) {
      href = `/${lang}/${storyPath}`
    } else {
      href = `/${lang}/${storyPath}`
    }
  } else {
    href = `/${lang}/${storyPath}`
  }

  if (secondaryLangs && secondaryLangs.length > 0) {
    href += (href.includes("?") ? "&" : "?") + `langs=${secondaryLangs.join(",")}`
  }

  return href
}
