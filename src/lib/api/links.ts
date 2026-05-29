const VERSE_RE = /^\/en\/(?:scripture|bible)\/(?:ot|nt)\/([A-Za-z0-9]+)\/(\d+)(?:\/(\d+))?\/?$/;

export function localizeApiPath(path: string, iso: string): string {
    const m = VERSE_RE.exec(path);
    if (!m) return path;
    const [, book, chapter, verse] = m;
    const base = `/${iso}`;
    if (verse) return `${base}?book=${book.toUpperCase()}&ch=${chapter}&v=${verse}`;
    return `${base}?book=${book.toUpperCase()}&ch=${chapter}`;
}

export function isLocalApiPath(path: string): boolean {
    return VERSE_RE.test(path);
}
