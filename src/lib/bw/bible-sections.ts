/**
 * Canonical book → section grouping, used as a fallback for languages that
 * have no `app-config.json` (English/BSB and Spanish/DBT). PKF languages carry
 * their own `section` per book in app-config (spec §6.4), which takes priority.
 *
 * Section labels mirror the English SAB labels the CDN emits (e.g. "Pentateuch",
 * "Gospels") so the grouped picker looks consistent across all reader backends.
 */

export type Testament = "OT" | "NT"

interface SectionDef {
  id: string
  testament: Testament
  es: string
  books: string[]
}

const SECTIONS: SectionDef[] = [
  { id: "Pentateuch", testament: "OT", es: "Pentateuco", books: ["GEN", "EXO", "LEV", "NUM", "DEU"] },
  { id: "Historical", testament: "OT", es: "Históricos", books: ["JOS", "JDG", "RUT", "1SA", "2SA", "1KI", "2KI", "1CH", "2CH", "EZR", "NEH", "EST"] },
  { id: "Poetry", testament: "OT", es: "Poéticos", books: ["JOB", "PSA", "PRO", "ECC", "SNG"] },
  { id: "Major Prophets", testament: "OT", es: "Profetas mayores", books: ["ISA", "JER", "LAM", "EZK", "DAN"] },
  { id: "Minor Prophets", testament: "OT", es: "Profetas menores", books: ["HOS", "JOL", "AMO", "OBA", "JON", "MIC", "NAM", "HAB", "ZEP", "HAG", "ZEC", "MAL"] },
  { id: "Gospels", testament: "NT", es: "Evangelios", books: ["MAT", "MRK", "LUK", "JHN"] },
  { id: "History", testament: "NT", es: "Historia", books: ["ACT"] },
  { id: "Pauline Epistles", testament: "NT", es: "Cartas de Pablo", books: ["ROM", "1CO", "2CO", "GAL", "EPH", "PHP", "COL", "1TH", "2TH", "1TI", "2TI", "TIT", "PHM"] },
  { id: "General Epistles", testament: "NT", es: "Cartas generales", books: ["HEB", "JAS", "1PE", "2PE", "1JN", "2JN", "3JN", "JUD"] },
  { id: "Revelation", testament: "NT", es: "Apocalipsis", books: ["REV"] },
]

const bySection = new Map<string, SectionDef>()
const byBook = new Map<string, SectionDef>()
for (const s of SECTIONS) {
  bySection.set(s.id, s)
  for (const code of s.books) byBook.set(code, s)
}

/** Canonical (English) section id for a USFM book code. */
export function sectionOf(code: string): string {
  return byBook.get(code)?.id ?? "Other"
}

/** Testament for a USFM book code (OT/NT), via the section table. */
export function testamentOf(code: string): Testament {
  return byBook.get(code)?.testament ?? "NT"
}

/** Localised display name for a section id (English id → Spanish, else id). */
export function sectionLabel(sectionId: string, lang: "en" | "es"): string {
  if (lang === "en") return sectionId
  return bySection.get(sectionId)?.es ?? sectionId
}
