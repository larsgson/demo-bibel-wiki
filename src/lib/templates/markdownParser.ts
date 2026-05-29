import type { LocaleMap, ParsedMarkdown, Section, VerseEntry } from './types';
import { localeLookup } from './locales';
import { parseReference, splitReference } from './refs';

/**
 * Story-markdown parser ported from example/bibel-wiki/src/lib/markdown-parser.ts.
 *
 * Inputs:
 *   - markdown:    the raw .md text from /static/templates/<t>/<cat>/<s>.md
 *   - chapterText: { [`${BOOK} ${chapter}`]: VerseEntry[] }  for verse lookup
 *   - locale:      flat dotted-key map for resolving [[t:…]] tokens
 *   - fallback:    secondary locale (always tried after the primary)
 */

function resolveTokens(text: string, locale: LocaleMap, fallback: LocaleMap): string {
    if (!text) return text;
    return text.replace(/\[\[t:([^\]]+)\]\]/g, (full, key: string) => {
        const k = key.trim();
        return localeLookup(locale, k) ?? localeLookup(fallback, k) ?? full;
    });
}

function getTextForReference(
    reference: string,
    chapterText: Record<string, VerseEntry[]>
): string | null {
    const parts = splitReference(reference);
    const chunks: string[] = [];

    for (const r of parts) {
        const parsed = parseReference(r);
        if (!parsed) continue;
        const key = `${parsed.book} ${parsed.chapter}`;
        const verses = chapterText[key];
        if (!verses) continue;

        let chunk = '';
        if (parsed.verses) {
            chunk = verses
                .filter((v) => parsed.verses!.includes(v.num))
                .map((v) => v.text)
                .join(' ');
        } else {
            const start = parsed.verseStart ?? 0;
            const end = parsed.verseEnd ?? Number.POSITIVE_INFINITY;
            chunk = verses
                .filter((v) => v.num >= start && v.num <= end)
                .map((v) => v.text)
                .join(' ');
        }
        if (chunk.trim()) chunks.push(chunk.trim());
    }
    return chunks.length ? chunks.join(' ') : null;
}

function replaceInlineRefs(
    text: string,
    chapterText: Record<string, VerseEntry[]>
): string {
    return text.replace(/\[\[ref:\s*(.+?)\]\]/g, (full, ref: string) => {
        const resolved = getTextForReference(ref.trim(), chapterText);
        return resolved ?? full;
    });
}

export function parseStoryMarkdown(
    markdown: string,
    chapterText: Record<string, VerseEntry[]> = {},
    locale: LocaleMap = {},
    fallback: LocaleMap = {}
): ParsedMarkdown {
    if (!markdown) return { title: '', sections: [] };

    const sections: Section[] = [];
    let current: Section | null = { imageUrls: [], text: '', reference: '' };
    let title = '';

    const lines = markdown.split('\n');
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();

        if (line.startsWith('# ') && !title) {
            const t = line.slice(2).trim();
            title = t.includes('[[t:') ? resolveTokens(t, locale, fallback) : t;
            continue;
        }
        if (line.startsWith('[[story:') || line.startsWith('[[chapter:')) continue;

        if (line.includes('[[t:')) {
            const resolved = resolveTokens(line, locale, fallback);
            if (!resolved.trim()) continue;
            // Same-line resolved to itself with empty fallback maps → treat as
            // unresolved and skip (avoids leaving raw [[t:…]] tokens visible).
            if (resolved === line && Object.keys(locale).length === 0 && Object.keys(fallback).length === 0) continue;
            if (resolved.startsWith('## ')) {
                title = resolved.replace(/^#+\s*/, '').trim();
                continue;
            }
            if (resolved.startsWith('### ') && current) {
                current.heading = resolved.replace(/^#+\s*/, '').trim();
                continue;
            }
            if (current && resolved.trim()) {
                current.text += (current.text ? '\n' : '') + resolved.trim();
            }
            continue;
        }

        if (line.startsWith('[[ref:')) {
            const m = line.match(/\[\[ref:\s*(.+?)\]\]/);
            if (m && current) current.reference = m[1].trim();
            continue;
        }

        const imageMatch = line.match(/!\[.*?\]\((.*?)\)/);
        if (imageMatch) {
            // Allow multiple images per section as long as the section has no
            // text/reference/heading yet (rule lifted from the bibel-wiki parser).
            if (current && !current.reference && !current.text.trim()) {
                current.imageUrls.push(imageMatch[1]);
            } else {
                if (
                    current &&
                    (current.text.trim() || current.reference || current.imageUrls.length > 0 || current.heading)
                ) {
                    sections.push(current);
                }
                current = { imageUrls: [imageMatch[1]], text: '', reference: '' };
            }
        } else if (current && line) {
            current.text += (current.text ? '\n' : '') + line;
        }
    }
    if (current) sections.push(current);

    // Resolve any [[ref:…]] tokens nested inside section text, and fill in
    // text from the section's main reference when no body text is given.
    for (const s of sections) {
        if (s.text) s.text = replaceInlineRefs(s.text, chapterText);
        if (s.reference && !s.text.trim()) {
            const t = getTextForReference(s.reference, chapterText);
            if (t) s.text = t;
        }
    }
    return { title, sections };
}
