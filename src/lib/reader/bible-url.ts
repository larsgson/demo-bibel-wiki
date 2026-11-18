/**
 * Chapter addresses for the Bible reader: `/<iso>/b/<book>/<chapter>`,
 * e.g. `/eng/b/gen/2`. `b` keeps these apart from story templates
 * (`/<iso>/<template>/…`), so no template may be called `b` (see
 * RESERVED_TEMPLATE_NAMES in template-utils.ts). The book is a USFM code in
 * any case; a missing chapter means chapter 1.
 *
 * The reader opens the chapter such an address names, and while the Bible
 * pane shows it keeps the address on the chapter it shows.
 */

export type BibleRef = { book: string; chapter: number }

const REF_PATH = /^\/([a-z]{3})\/b\/([0-9a-z]{3})(?:\/(\d+))?\/?$/i

/** The chapter a path names, or null when it isn't a chapter address. */
export function parseBiblePath(pathname: string): (BibleRef & { iso: string }) | null {
    const m = REF_PATH.exec(pathname)
    if (!m) return null
    const chapter = m[3] ? Number(m[3]) : 1
    return chapter > 0 ? { iso: m[1].toLowerCase(), book: m[2].toUpperCase(), chapter } : null
}

/** `/eng/b/gen/2` */
export function biblePath(iso: string, ref: BibleRef): string {
    return `/${iso}/b/${ref.book.toLowerCase()}/${ref.chapter}`
}

/** Whether a path is the page the reader lives on: the language home
 *  (`/eng/`) or one of its chapter addresses (`/eng/b/…`). */
export function isReaderPath(pathname: string, iso?: string): boolean {
    const m = /^\/([a-z]{3})(?:\/b(?:\/.*)?)?\/?$/.exec(pathname)
    return !!m && (!iso || m[1] === iso)
}
