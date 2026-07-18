/**
 * Vernacular UI strings for our own hand-built chrome (sidebars, topbar,
 * bottom bar, settings panel) — layered on top of, not a replacement for,
 * this app's own en/es locale files (src/locales/*.ts).
 *
 * The CDN's spec §6.5 `_app/nav-base.json` set is SAB's own ~459-key
 * vocabulary for SAB's original app chrome, which this app never adopted
 * wholesale (we built our own smaller, differently-named UI). As of the
 * 2026.07.18 release, the CDN also publishes `_app/nav-<code>.json` —
 * vernacular translations of that same key set for Spanish, Portuguese,
 * French, Dutch, and Indonesian. Since a handful of our own concepts (Home,
 * Search, Bible, Settings, Bookmarks, About, Share…) line up cleanly with
 * SAB's keys, KEY_MAP below is a small Rosetta stone: look up our key's SAB
 * equivalent, resolve it in the fetched vernacular set (falling back to the
 * shared English nav-base.json for any key the vernacular set doesn't
 * cover, same as the spec's own guidance), and fall back to this app's own
 * en/es text for anything with no mapping or no vernacular set at all.
 */

import { pkfUrl } from "./pkf-url"
import { loadAppConfig, loadNavBase } from "../data/app-config"

/** Languages the CDN currently ships nav-<code>.json for (2026.07.18
 *  release). Just an optimization to skip a guaranteed-404 fetch for codes
 *  not yet published — expand this if more show up later. */
const SUPPORTED_VERNACULAR_UI = new Set(["es", "pt", "fr", "nl", "id"])

const KEY_MAP: Record<string, string> = {
  "nav.home": "Menu_Home",
  "nav.search": "Menu_Search",
  "nav.bible": "Menu_Bible",
  "nav.settings": "Menu_Settings",
  "reader.settings": "Menu_Settings",
  "nav.textAppearance": "Menu_Text_Appearance",
  "nav.bookmarks": "Annotation_Bookmarks",
  "nav.noBookmarks": "Annotation_Bookmarks_None",
  "nav.about": "Menu_About",
  "nav.closeMenu": "Button_Close_Drawer",
  "nav.toggleMenu": "Button_Open_Drawer",
  "reader.shareLink": "Button_Share",
  "reader.linkCopied": "Text_Copied",
  "biblePicker.bookTab": "Selector_Book",
  "biblePicker.chapterTab": "Selector_Chapter",
  "biblePicker.verseTab": "Selector_Verse",
  "nav.ot": "Book_Group_OT",
  "nav.nt": "Book_Group_NT",
}

export type VernacularStrings = Record<string, string>

const cache = new Map<string, Promise<VernacularStrings | null>>()

/** Resolve + fetch this language's vernacular UI set, merged over the
 *  shared English nav-base.json, or null if this language has none (every
 *  lookup then falls back to this app's own locale text). */
export function loadVernacularNav(iso: string): Promise<VernacularStrings | null> {
  const cached = cache.get(iso)
  if (cached) return cached
  const p = (async () => {
    try {
      const cfg = await loadAppConfig(iso)
      const code = (cfg?.interfaceLanguages?.available ?? [])
        .map((l) => l.code)
        .find((c) => c !== "en" && SUPPORTED_VERNACULAR_UI.has(c))
      if (!code) return null

      const [base, vernRes] = await Promise.all([
        loadNavBase(),
        fetch(pkfUrl(`/pkf/_app/nav-${code}.json`)),
      ])
      if (!vernRes.ok) return null
      const vern = await vernRes.json()
      return { ...base, ...vern } as VernacularStrings
    } catch {
      return null
    }
  })()
  cache.set(iso, p)
  return p
}

/** Look up `ourKey` (e.g. "nav.home") via KEY_MAP in the fetched vernacular
 *  set; `fallback` is this app's own en/es text for when there's no
 *  vernacular set, no mapping for this key, or the mapped key is absent. */
export function vernacularLabel(
  strings: VernacularStrings | null,
  ourKey: string,
  fallback: string,
): string {
  if (!strings) return fallback
  const sabKey = KEY_MAP[ourKey]
  if (!sabKey) return fallback
  return strings[sabKey] ?? fallback
}
