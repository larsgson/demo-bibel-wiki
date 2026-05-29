/**
 * Major trade/bridge languages that have timing data available.
 * Pre-built static pages are generated for these languages.
 * Derived from regions.conf @trade languages cross-referenced with available timing data.
 *
 * DEV_LANGUAGES: subset for faster builds during development.
 * FULL_LANGUAGES: complete list for production (set FULL_LANGS=1 to enable).
 */
const DEV_LANGUAGES = [
  "eng", "fra", "por", "heb", "arb", "swe",
] as const

const FULL_LANGUAGES = [
  "eng", "spa", "fra", "por", "arb", "cmn", "hin", "ben", "rus", "kor",
  "tha", "vie", "ind", "swe", "tur", "pol", "nld", "ron", "ukr", "urd",
  "tam", "tel", "kan", "mal", "mar", "guj", "pan", "amh", "hau", "yor",
  "ibo", "heb", "tgl", "ceb", "mya", "lao", "npi", "asm", "ory", "tir",
  "som", "hat", "uzn", "tgk", "tuk", "smo", "fij", "bis", "jam", "pis",
] as const

export const POPULAR_LANGUAGES = import.meta.env.FULL_LANGS ? FULL_LANGUAGES : DEV_LANGUAGES
