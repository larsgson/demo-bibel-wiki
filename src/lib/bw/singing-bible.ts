/**
 * Links to TheSinging.Bible (thesinging.bible): every chapter sung word for
 * word. Its catalog (`/manifest.json`) has no CORS header, so what it covers
 * is copied here (2026-11-10):
 *
 *   sbe  English (Singing Bible Edition)  all 1,189 chapters
 *   rv9  Spanish (Reina-Valera 1909)      all 1,189 chapters
 *   rom  Romanian                         John only
 *
 * Its addresses: `/bible/<slug>/<chapter>` opens the player at a chapter in
 * the listener's own style and voice; `?lang=es&style=<id>` picks Spanish
 * (it only reads `lang` together with a style or voice). Other translations
 * need the player's hash, `#<translation>/<voice>/<age>/<style>/<NN-slug>/<chapter>`.
 */

const ORIGIN = "https://thesinging.bible"

/** Off for now: the reader shows no link while this is false (tested 2026-11-13). */
export const SINGING_BIBLE_LINK_ENABLED = false

/** USFM book code → its slug, in canon order (the 1-based index is its book number). */
const BOOKS: [string, string][] = (
  "GEN:genesis EXO:exodus LEV:leviticus NUM:numbers DEU:deuteronomy JOS:joshua " +
  "JDG:judges RUT:ruth 1SA:1-samuel 2SA:2-samuel 1KI:1-kings 2KI:2-kings " +
  "1CH:1-chronicles 2CH:2-chronicles EZR:ezra NEH:nehemiah EST:esther JOB:job " +
  "PSA:psalms PRO:proverbs ECC:ecclesiastes SNG:song-of-solomon ISA:isaiah " +
  "JER:jeremiah LAM:lamentations EZK:ezekiel DAN:daniel HOS:hosea JOL:joel " +
  "AMO:amos OBA:obadiah JON:jonah MIC:micah NAM:nahum HAB:habakkuk " +
  "ZEP:zephaniah HAG:haggai ZEC:zechariah MAL:malachi MAT:matthew MRK:mark " +
  "LUK:luke JHN:john ACT:acts ROM:romans 1CO:1-corinthians 2CO:2-corinthians " +
  "GAL:galatians EPH:ephesians PHP:philippians COL:colossians " +
  "1TH:1-thessalonians 2TH:2-thessalonians 1TI:1-timothy 2TI:2-timothy " +
  "TIT:titus PHM:philemon HEB:hebrews JAS:james 1PE:1-peter 2PE:2-peter " +
  "1JN:1-john 2JN:2-john 3JN:3-john JUD:jude REV:revelation"
)
  .split(" ")
  .map((pair) => pair.split(":") as [string, string])

const BOOK_BY_CODE = new Map(BOOKS.map(([code, slug], i) => [code, { num: i + 1, slug }]))

/** The link for one chapter, by our language code. */
const LANGS: Record<string, (slug: string, num: number, chapter: number) => string | null> = {
  eng: (slug, _num, ch) => `${ORIGIN}/bible/${slug}/${ch}`,
  spa: (slug, _num, ch) => `${ORIGIN}/bible/${slug}/${ch}?lang=es&style=alabanza`,
  ron: (slug, num, ch) => slug === "john"
    ? `${ORIGIN}/#rom/male/adult/contemporary-pop/${String(num).padStart(2, "0")}-${slug}/${ch}`
    : null,
}

/** TheSinging.Bible's page for this chapter, or null when it has no song for it. */
export function singingBibleUrl(iso: string, book: string, chapter: number): string | null {
  const b = BOOK_BY_CODE.get(book.toUpperCase())
  const link = LANGS[iso]
  if (!b || !link || !(chapter > 0)) return null
  return link(b.slug, b.num, chapter)
}
