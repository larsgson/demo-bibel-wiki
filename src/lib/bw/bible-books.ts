export type Book = {
  id: number
  name: string
  nameFr: string
  chapters: number
  abbrev: string
  code: string
}

const books: Book[] = [
  { id: 1, name: 'Genesis', nameFr: 'Genèse', chapters: 50, abbrev: 'Gen', code: 'GEN' },
  { id: 2, name: 'Exodus', nameFr: 'Exode', chapters: 40, abbrev: 'Exo', code: 'EXO' },
  { id: 3, name: 'Leviticus', nameFr: 'Lévitique', chapters: 27, abbrev: 'Lev', code: 'LEV' },
  { id: 4, name: 'Numbers', nameFr: 'Nombres', chapters: 36, abbrev: 'Num', code: 'NUM' },
  { id: 5, name: 'Deuteronomy', nameFr: 'Deutéronome', chapters: 34, abbrev: 'Deu', code: 'DEU' },
  { id: 6, name: 'Joshua', nameFr: 'Josué', chapters: 24, abbrev: 'Jos', code: 'JOS' },
  { id: 7, name: 'Judges', nameFr: 'Juges', chapters: 21, abbrev: 'Jdg', code: 'JDG' },
  { id: 8, name: 'Ruth', nameFr: 'Ruth', chapters: 4, abbrev: 'Rut', code: 'RUT' },
  { id: 9, name: '1 Samuel', nameFr: '1 Samuel', chapters: 31, abbrev: '1Sa', code: '1SA' },
  { id: 10, name: '2 Samuel', nameFr: '2 Samuel', chapters: 24, abbrev: '2Sa', code: '2SA' },
  { id: 11, name: '1 Kings', nameFr: '1 Rois', chapters: 22, abbrev: '1Ki', code: '1KI' },
  { id: 12, name: '2 Kings', nameFr: '2 Rois', chapters: 25, abbrev: '2Ki', code: '2KI' },
  { id: 13, name: '1 Chronicles', nameFr: '1 Chroniques', chapters: 29, abbrev: '1Ch', code: '1CH' },
  { id: 14, name: '2 Chronicles', nameFr: '2 Chroniques', chapters: 36, abbrev: '2Ch', code: '2CH' },
  { id: 15, name: 'Ezra', nameFr: 'Esdras', chapters: 10, abbrev: 'Ezr', code: 'EZR' },
  { id: 16, name: 'Nehemiah', nameFr: 'Néhémie', chapters: 13, abbrev: 'Neh', code: 'NEH' },
  { id: 17, name: 'Esther', nameFr: 'Esther', chapters: 10, abbrev: 'Est', code: 'EST' },
  { id: 18, name: 'Job', nameFr: 'Job', chapters: 42, abbrev: 'Job', code: 'JOB' },
  { id: 19, name: 'Psalms', nameFr: 'Psaumes', chapters: 150, abbrev: 'Psa', code: 'PSA' },
  { id: 20, name: 'Proverbs', nameFr: 'Proverbes', chapters: 31, abbrev: 'Pro', code: 'PRO' },
  { id: 21, name: 'Ecclesiastes', nameFr: 'Ecclésiaste', chapters: 12, abbrev: 'Ecc', code: 'ECC' },
  { id: 22, name: 'Song of Solomon', nameFr: 'Cantique des Cantiques', chapters: 8, abbrev: 'Son', code: 'SNG' },
  { id: 23, name: 'Isaiah', nameFr: 'Ésaïe', chapters: 66, abbrev: 'Isa', code: 'ISA' },
  { id: 24, name: 'Jeremiah', nameFr: 'Jérémie', chapters: 52, abbrev: 'Jer', code: 'JER' },
  { id: 25, name: 'Lamentations', nameFr: 'Lamentation de Jérémie', chapters: 5, abbrev: 'Lam', code: 'LAM' },
  { id: 26, name: 'Ezekiel', nameFr: 'Ézéchiel', chapters: 48, abbrev: 'Eze', code: 'EZK' },
  { id: 27, name: 'Daniel', nameFr: 'Daniel', chapters: 12, abbrev: 'Dan', code: 'DAN' },
  { id: 28, name: 'Hosea', nameFr: 'Osée', chapters: 14, abbrev: 'Hos', code: 'HOS' },
  { id: 29, name: 'Joel', nameFr: 'Joël', chapters: 3, abbrev: 'Joe', code: 'JOL' },
  { id: 30, name: 'Amos', nameFr: 'Amos', chapters: 9, abbrev: 'Amo', code: 'AMO' },
  { id: 31, name: 'Obadiah', nameFr: 'Abdias', chapters: 1, abbrev: 'Oba', code: 'OBA' },
  { id: 32, name: 'Jonah', nameFr: 'Jonas', chapters: 4, abbrev: 'Jon', code: 'JON' },
  { id: 33, name: 'Micah', nameFr: 'Michée', chapters: 7, abbrev: 'Mic', code: 'MIC' },
  { id: 34, name: 'Nahum', nameFr: 'Nahum', chapters: 3, abbrev: 'Nah', code: 'NAM' },
  { id: 35, name: 'Habakkuk', nameFr: 'Habacuc', chapters: 3, abbrev: 'Hab', code: 'HAB' },
  { id: 36, name: 'Zephaniah', nameFr: 'Sophonie', chapters: 3, abbrev: 'Zep', code: 'ZEP' },
  { id: 37, name: 'Haggai', nameFr: 'Aggée', chapters: 2, abbrev: 'Hag', code: 'HAG' },
  { id: 38, name: 'Zechariah', nameFr: 'Zacharie', chapters: 14, abbrev: 'Zec', code: 'ZEC' },
  { id: 39, name: 'Malachi', nameFr: 'Malachie', chapters: 4, abbrev: 'Mal', code: 'MAL' },
  { id: 40, name: 'Matthew', nameFr: 'Matthieu', chapters: 28, abbrev: 'Mat', code: 'MAT' },
  { id: 41, name: 'Mark', nameFr: 'Marc', chapters: 16, abbrev: 'Mar', code: 'MRK' },
  { id: 42, name: 'Luke', nameFr: 'Luc', chapters: 24, abbrev: 'Luk', code: 'LUK' },
  { id: 43, name: 'John', nameFr: 'Jean', chapters: 21, abbrev: 'Joh', code: 'JHN' },
  { id: 44, name: 'Acts', nameFr: 'Actes', chapters: 28, abbrev: 'Act', code: 'ACT' },
  { id: 45, name: 'Romans', nameFr: 'Romains', chapters: 16, abbrev: 'Rom', code: 'ROM' },
  { id: 46, name: '1 Corinthians', nameFr: '1 Corinthiens', chapters: 16, abbrev: '1Co', code: '1CO' },
  { id: 47, name: '2 Corinthians', nameFr: '2 Corinthiens', chapters: 13, abbrev: '2Co', code: '2CO' },
  { id: 48, name: 'Galatians', nameFr: 'Galates', chapters: 6, abbrev: 'Gal', code: 'GAL' },
  { id: 49, name: 'Ephesians', nameFr: 'Éphésiens', chapters: 6, abbrev: 'Eph', code: 'EPH' },
  { id: 50, name: 'Philippians', nameFr: 'Philippiens', chapters: 4, abbrev: 'Phi', code: 'PHP' },
  { id: 51, name: 'Colossians', nameFr: 'Colossiens', chapters: 4, abbrev: 'Col', code: 'COL' },
  { id: 52, name: '1 Thessalonians', nameFr: '1 Thessaloniciens', chapters: 5, abbrev: '1Th', code: '1TH' },
  { id: 53, name: '2 Thessalonians', nameFr: '2 Thessaloniciens', chapters: 3, abbrev: '2Th', code: '2TH' },
  { id: 54, name: '1 Timothy', nameFr: '1 Timothée', chapters: 6, abbrev: '1Ti', code: '1TI' },
  { id: 55, name: '2 Timothy', nameFr: '2 Timothée', chapters: 4, abbrev: '2Ti', code: '2TI' },
  { id: 56, name: 'Titus', nameFr: 'Tite', chapters: 3, abbrev: 'Tit', code: 'TIT' },
  { id: 57, name: 'Philemon', nameFr: 'Philémon', chapters: 1, abbrev: 'Phm', code: 'PHM' },
  { id: 58, name: 'Hebrews', nameFr: 'Hébreux', chapters: 13, abbrev: 'Heb', code: 'HEB' },
  { id: 59, name: 'James', nameFr: 'Jacques', chapters: 5, abbrev: 'Jam', code: 'JAS' },
  { id: 60, name: '1 Peter', nameFr: '1 Pierre', chapters: 5, abbrev: '1Pe', code: '1PE' },
  { id: 61, name: '2 Peter', nameFr: '2 Pierre', chapters: 3, abbrev: '2Pe', code: '2PE' },
  { id: 62, name: '1 John', nameFr: '1 Jean', chapters: 5, abbrev: '1Jn', code: '1JN' },
  { id: 63, name: '2 John', nameFr: '2 Jean', chapters: 1, abbrev: '2Jn', code: '2JN' },
  { id: 64, name: '3 John', nameFr: '3 Jean', chapters: 1, abbrev: '3Jn', code: '3JN' },
  { id: 65, name: 'Jude', nameFr: 'Jude', chapters: 1, abbrev: 'Jud', code: 'JUD' },
  { id: 66, name: 'Revelation', nameFr: 'Apocalypse', chapters: 22, abbrev: 'Rev', code: 'REV' },
]

export default books

export function getBookById(id: number): Book | undefined {
  return books.find(b => b.id === id)
}

export function getBookByCode(code: string): Book | undefined {
  return books.find(b => b.code === code.toUpperCase())
}

export function isOldTestament(bookId: number): boolean {
  return bookId >= 1 && bookId <= 39
}
