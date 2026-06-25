/**
 * Study-mode language gating.
 *
 * Study mode (UI level 3 / "Estudiar") is gated on language: the bcv-query
 * backend only supports study content for a fixed set of languages.
 *
 * Availability rule: Study mode is available iff AT LEAST ONE selected language
 * (primary or secondary) is study-capable — including the single-language case.
 *
 * Prompting rule (separate): only hint the user to add a study language when
 * 2+ languages are selected and none is study-capable. A single-language user
 * is never prompted.
 */

export const STUDY_LANGUAGES = [
  "arb", "asm", "ben", "eng", "fra", "hau", "hin", "por", "rus", "spa",
] as const

const STUDY_SET = new Set<string>(STUDY_LANGUAGES)

/** Is a single ISO code a study-capable language? */
export function isStudyLanguage(iso: string): boolean {
  return STUDY_SET.has(iso)
}

/** Is Study mode available for the given selection (primary + secondaries)? */
export function hasStudyCapableLanguage(selectedLangs: string[]): boolean {
  return selectedLangs.some((iso) => STUDY_SET.has(iso))
}

/**
 * Should we surface the "add a study language" hint? Only when the user has
 * committed to multiple languages but none of them unlocks study.
 */
export function shouldPromptForStudyLanguage(selectedLangs: string[]): boolean {
  return selectedLangs.length >= 2 && !hasStudyCapableLanguage(selectedLangs)
}
