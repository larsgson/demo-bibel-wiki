import { en } from "../../locales/en"
import { fr } from "../../locales/fr"
import { de } from "../../locales/de"
import { es } from "../../locales/es"
import { pt } from "../../locales/pt"
import { ru } from "../../locales/ru"
import { hi } from "../../locales/hi"
import { ar } from "../../locales/ar"
import { ro } from "../../locales/ro"
import { zh } from "../../locales/zh"
import { id } from "../../locales/id"
import { sw } from "../../locales/sw"

const locales: Record<string, any> = { en, fr, de, es, pt, ru, hi, ar, ro, zh, id, sw }
const defaultLocale = "en"

const localeMap: Record<string, string> = {
  eng: "en",
  fra: "fr",
  deu: "de",
  spa: "es",
  por: "pt",
  rus: "ru",
  hin: "hi",
  arb: "ar",
  ron: "ro",
  cmn: "zh",
  zho: "zh",
  ind: "id",
  swh: "sw",
  swa: "sw",
  en: "en",
  fr: "fr",
  de: "de",
  es: "es",
  pt: "pt",
  ru: "ru",
  hi: "hi",
  ar: "ar",
  ro: "ro",
  zh: "zh",
  id: "id",
  sw: "sw",
}

function hasLocale(langCode: string): boolean {
  const mapped = localeMap[langCode]
  return !!mapped && !!locales[mapped]
}

/**
 * Resolve the best UI locale code using priority:
 * 1. Primary selected language (if locale exists)
 * 2. Browser language
 * 3. Any secondary language with a locale
 * 4. English fallback
 */
export function resolveUILang(
  primaryLang: string,
  secondaryLangs: string[] = [],
): string {
  // 1. Primary language
  if (hasLocale(primaryLang)) return primaryLang

  // 2. Browser language
  if (typeof navigator !== "undefined") {
    for (const bl of navigator.languages || [navigator.language]) {
      const code = bl.split("-")[0].toLowerCase()
      if (hasLocale(code)) return code
    }
  }

  // 3. Any secondary language with a locale
  for (const lang of secondaryLangs) {
    if (hasLocale(lang)) return lang
  }

  // 4. Fallback
  return defaultLocale
}

export function getLocale(langCode: string): any {
  const mappedCode = localeMap[langCode] || defaultLocale
  return locales[mappedCode] || locales[defaultLocale]
}

/**
 * Map any recognized language code (3-letter ISO 639-3 like "eng"/"ind" or
 * the locale's own 2-letter key) to its 2-letter locale key. Needed wherever
 * a `Localized` object (`{ en, es, id, ... }`) is indexed directly instead
 * of going through `t()`, which already does this mapping internally.
 */
export function localeCode(langCode: string): string {
  return localeMap[langCode] || defaultLocale
}

function lookup(locale: any, keys: string[]): string | undefined {
  let value: any = locale
  for (const key of keys) {
    if (value == null) return undefined
    value = value[key]
  }
  return typeof value === "string" ? value : undefined
}

/**
 * Look up a UI string by dot-path. Falls back to English when the key is
 * missing in the target locale (so partial translations degrade to English,
 * never to the raw path), and finally to the path itself if truly unknown.
 */
export function t(langCode: string, path: string): string {
  const keys = path.split(".")
  const hit = lookup(getLocale(langCode), keys)
  if (hit !== undefined) return hit
  const enHit = lookup(locales[defaultLocale], keys)
  return enHit !== undefined ? enHit : path
}
