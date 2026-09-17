import type {
    SofriaDoc,
    SofriaBlock,
    SofriaParagraph,
    SofriaGraft,
    SofriaWrapper,
    SofriaContent,
} from './sofria';
import type { HelloaoChapterJson, HelloaoContentItem } from '../bw/content-sources';
import type { VerseEntry } from '../templates/types';

/**
 * Builds hand-crafted SofriaDoc objects for the three non-PKF text sources
 * (helloAO, DBT, openbible) so the whole app can render/extract chapter text
 * through the ONE shared pipeline (renderSofria / extractVersesFromSofria)
 * PKF already used natively — see internal-docs/unified-text-pipeline.md.
 *
 * These are pure functions: no fetching, no caching. Callers (chapter-doc.ts)
 * fetch each source's own raw response and hand it to the matching emulator
 * here.
 */

// ── small builders ──────────────────────────────────────────────────────────

/** `usfm:p` / `usfm:q1` / `usfm:d` / … paragraph, given the bare marker
 *  (without the "usfm:" prefix — renderSofria's usfmMarker() strips it back
 *  off, and cssClassForMarker() strips a trailing level-1 digit). */
export function paragraph(marker: string, content: SofriaContent[]): SofriaParagraph {
    return { type: 'paragraph', subtype: `usfm:${marker}`, content };
}

/** One verse's wrapper — `.verse-block[data-v]` in renderSofria's output.
 *  `withLabel` controls whether the verse number mark is included (only the
 *  FIRST wrapper emitted for a given verse should carry it — a verse split
 *  across several wrappers, e.g. multi-line poetry, must not repeat the
 *  number). */
export function versesWrapper(num: number, content: SofriaContent[], withLabel: boolean): SofriaWrapper {
    const items: SofriaContent[] = withLabel
        ? [{ type: 'mark', subtype: 'verses_label', atts: { number: String(num) } }, ...content]
        : content;
    return { type: 'wrapper', subtype: 'verses', atts: { number: String(num) }, content: items };
}

/** A top-level heading graft — `sequence.type: 'heading'` is what
 *  renderSofria's top-level walk keys off (its own `subtype` is left unset,
 *  matching the asymmetry real PKF data has — see sofria.ts's header
 *  comment). Renders as `<div class="s">…</div>`. */
export function headingGraft(text: string): SofriaGraft {
    return { type: 'graft', sequence: { type: 'heading', blocks: [paragraph('s1', [text])] } };
}

/** An inline footnote graft, with its caller symbol pulled from a nested
 *  `note_caller` graft — mirrors real PKF footnote shape exactly (see
 *  sofria.ts's renderNoteSeq/pullText). */
export function footnoteGraft(caller: string, text: string): SofriaGraft {
    return {
        type: 'graft',
        subtype: 'footnote',
        sequence: {
            type: 'footnote',
            blocks: [
                paragraph('f', [
                    {
                        type: 'graft',
                        subtype: 'note_caller',
                        sequence: { type: 'note_caller', blocks: [{ type: 'paragraph', content: [caller] }] },
                    },
                    text,
                ]),
            ],
        },
    };
}

// ── flat verses (DBT / openbible) ───────────────────────────────────────────

/**
 * DBT and openbible give us plain `{num, text}` pairs with no structure at
 * all — one paragraph, one verses-wrapper per verse. Round-trips through
 * extractVersesFromSofria back to the same verses (see sofriaEmulate.test.ts).
 */
export function flatVersesToSofria(verses: VerseEntry[]): SofriaDoc {
    const sorted = [...verses].sort((a, b) => a.num - b.num);
    const blocks: SofriaBlock[] = sorted.length
        ? [paragraph('p', sorted.map((v) => versesWrapper(v.num, [v.text.trim()], true)))]
        : [];
    return { sequence: { type: 'main', blocks } };
}

// ── helloAO (rich: headings, poetry, footnotes) ─────────────────────────────

interface HelloaoVerseLine {
    poem: number | null;
    items: SofriaContent[];
}

/**
 * Split one verse's `content` array into "lines" — a fresh line starts at
 * every `{text, poem}` fragment once the current line already has anything
 * in it (regardless of whether the poem level matches — this mirrors the
 * exact boundary rule the previous helloAO renderer used, see the removed
 * helloaoChapterRender.ts's renderVerse), at every explicit `{lineBreak}`,
 * and never at a plain string or a footnote `{noteId}` (those just append
 * to whatever line is open). A verse entirely without poem levels ends up
 * as N "lines" that the caller re-joins with a space for one flowing prose
 * wrapper; a verse WITH any poem level renders each line as its own
 * `usfm:q{level}` paragraph.
 */
function splitVerseLines(
    content: HelloaoContentItem[],
    footnoteFor: (noteId: number) => SofriaGraft,
): HelloaoVerseLine[] {
    const lines: HelloaoVerseLine[] = [];
    let current: HelloaoVerseLine = { poem: null, items: [] };

    function startLine(poem: number | null) {
        if (current.items.length > 0) lines.push(current);
        current = { poem, items: [] };
    }

    for (const it of content) {
        if (typeof it === 'string') {
            current.items.push(it);
            continue;
        }
        if (it && typeof it === 'object') {
            if ('text' in it && typeof it.text === 'string') {
                const poemLevel = it.poem ?? null;
                if (current.items.length > 0 || current.poem !== poemLevel) startLine(poemLevel);
                const node: SofriaContent = it.wordsOfJesus
                    ? { type: 'wrapper', subtype: 'usfm:wj', content: [it.text] }
                    : it.text;
                current.items.push(node);
                // Every `{text}` fragment gets a trailing space unconditionally
                // — matches content-sources.ts's helloaoVerseText exactly (its
                // plain-text extraction always does `out += c.text + " "`).
                // Because a {text} fragment always starts a fresh line once
                // anything is already on the current one (see the boundary
                // check above), this is the ONLY {text}-derived node a line can
                // ever have, so a single trailing space here is sufficient —
                // whatever plain-string/footnote content follows on the same
                // line (e.g. "Selah" after a quote) gets the correct gap
                // without needing per-pair spacing logic.
                current.items.push(' ');
                continue;
            }
            if ('lineBreak' in it && it.lineBreak) {
                startLine(current.poem);
                continue;
            }
            if ('noteId' in it && typeof it.noteId === 'number') {
                current.items.push(footnoteFor(it.noteId));
                continue;
            }
        }
    }
    if (current.items.length > 0) lines.push(current);
    return lines;
}

/**
 * Turn one helloAO chapter response into a SofriaDoc: headings and Hebrew
 * subtitles become top-level graft/paragraph blocks (extractVersesFromSofria
 * skips them, so they never leak into extracted verse text); consecutive
 * prose verses share one open `usfm:p` paragraph (same shape PKF produces
 * for a run of ordinary verses); any verse with a poem level flushes that
 * paragraph and renders one `usfm:q{level}` paragraph per line; footnotes
 * become inline footnote grafts resolved against `chapter.footnotes[]`.
 */
export function helloaoChapterToSofria(json: HelloaoChapterJson): SofriaDoc {
    const content = json?.chapter?.content ?? [];
    const footnotes = json?.chapter?.footnotes ?? [];
    const blocks: SofriaBlock[] = [];
    let prose: SofriaParagraph | null = null;

    function flushProse() {
        if (prose && prose.content.length > 0) blocks.push(prose);
        prose = null;
    }
    function openProse(): SofriaParagraph {
        if (!prose) prose = paragraph('p', []);
        return prose;
    }
    function footnoteFor(noteId: number): SofriaGraft {
        const fn = footnotes.find((f) => f.noteId === noteId);
        return footnoteGraft(fn?.caller ?? '', fn?.text ?? '');
    }

    for (const item of content) {
        if (item.type === 'heading') {
            flushProse();
            const text = Array.isArray((item as { content?: string[] }).content)
                ? (item as { content: string[] }).content.join(' ')
                : '';
            blocks.push(headingGraft(text));
            continue;
        }
        if (item.type === 'hebrew_subtitle') {
            flushProse();
            const text = Array.isArray((item as { content?: string[] }).content)
                ? (item as { content: string[] }).content.join(' ')
                : '';
            blocks.push(paragraph('d', [text]));
            continue;
        }
        if (item.type === 'line_break') {
            // Top-level line_break (between paragraphs, not inside a verse) —
            // starts a fresh prose paragraph, giving English prose real
            // paragraph breaks instead of one flowing block.
            flushProse();
            continue;
        }
        if (item.type !== 'verse') continue;

        const vNum = (item as { number?: number }).number;
        if (vNum == null) continue; // matches fetchHelloaoText's own filter
        const vContent = (item as { content?: HelloaoContentItem[] }).content ?? [];
        let lines = splitVerseLines(vContent, footnoteFor);
        if (lines.length === 0) lines = [{ poem: null, items: [] }]; // empty verse still gets its number shown

        const isPoetry = lines.some((l) => l.poem != null);
        if (!isPoetry) {
            const merged: SofriaContent[] = [];
            lines.forEach((line, i) => {
                if (i > 0) merged.push(' ');
                merged.push(...line.items);
            });
            openProse().content.push(versesWrapper(vNum, merged, true));
            continue;
        }
        flushProse();
        lines.forEach((line, i) => {
            const level = line.poem && line.poem >= 1 && line.poem <= 3 ? line.poem : 1;
            blocks.push(paragraph(`q${level}`, [versesWrapper(vNum, line.items, i === 0)]));
        });
    }
    flushProse();

    return { sequence: { type: 'main', blocks } };
}
