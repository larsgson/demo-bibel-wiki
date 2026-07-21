import type { RenderedChapter } from './sofria';

const HELLOAO_API = 'https://bible.helloao.org/api';

type HelloaoContentItem =
    | string
    | { text: string; poem?: number }
    | { lineBreak: true }
    | { noteId: number }
    | Record<string, unknown>;

type HelloaoChapterContent =
    | { type: 'verse'; number: number; content: HelloaoContentItem[] }
    | { type: 'heading'; content: string[] }
    | { type: 'hebrew_subtitle'; content: string[] }
    | { type: 'line_break' }
    | { type: string; [key: string]: unknown };

interface HelloaoFootnote {
    noteId: number;
    caller?: string;
    text: string;
}

function esc(s: string): string {
    return s
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

/**
 * Render one verse's `content` array into one-or-more poetry/prose lines.
 * helloAO gives each poem line its own `{ text, poem: N }` fragment (not
 * always separated by an explicit lineBreak — see content-sources.ts's
 * helloaoVerseText for the same quirk), so a fragment/lineBreak boundary
 * always starts a new line; consecutive prose fragments (no `poem`) stay on
 * one line. The verse number + footnote callers are emitted inline at the
 * point they occur, matching the sofria renderer's `.v` / `.note-caller`
 * convention so Reader.svelte's existing click handling just works.
 */
function renderVerse(
    vNum: number,
    content: HelloaoContentItem[],
    footnoteIdx: (noteId: number) => { idx: number; caller: string },
): Array<{ poem: number | null; html: string }> {
    const lines: Array<{ poem: number | null; html: string }> = [];
    let current: { poem: number | null; html: string } = { poem: null, html: '' };
    let placedVerseNum = false;

    function startLine(poem: number | null) {
        if (current.html) lines.push(current);
        current = { poem, html: '' };
    }

    function verseNumMarkup(): string {
        placedVerseNum = true;
        return `<span class="v" data-v="${vNum}">${vNum}</span>`;
    }

    for (const it of content) {
        if (typeof it === 'string') {
            if (!placedVerseNum) current.html += verseNumMarkup();
            current.html += esc(it);
            continue;
        }
        if (it && typeof it === 'object') {
            const obj = it as { text?: string; poem?: number; lineBreak?: true; noteId?: number };
            if (typeof obj.text === 'string') {
                const poemLevel = obj.poem ?? null;
                if (current.html || current.poem !== poemLevel) startLine(poemLevel);
                if (!placedVerseNum) current.html += verseNumMarkup();
                current.html += esc(obj.text);
                continue;
            }
            if (obj.lineBreak) {
                startLine(current.poem);
                continue;
            }
            if (typeof obj.noteId === 'number') {
                const { idx, caller } = footnoteIdx(obj.noteId);
                if (!placedVerseNum) current.html += verseNumMarkup();
                current.html += `<button type="button" class="note-caller" data-note-idx="${idx}" aria-label="Footnote">${esc(
                    caller
                )}</button>`;
                continue;
            }
        }
    }
    if (current.html) lines.push(current);
    // A verse with no renderable content at all still needs its number shown.
    if (lines.length === 0) lines.push({ poem: null, html: verseNumMarkup() });
    return lines;
}

export async function fetchAndRenderBSB(
    bookCode: string,
    chapter: number
): Promise<RenderedChapter> {
    const resp = await fetch(`${HELLOAO_API}/BSB/${bookCode}/${chapter}.json`);
    if (!resp.ok) return { html: '<p>No English text available.</p>', footnotes: [], xrefs: [] };
    const json = await resp.json();
    const content: HelloaoChapterContent[] = json?.chapter?.content ?? [];
    const rawFootnotes: HelloaoFootnote[] = json?.chapter?.footnotes ?? [];

    const footnotes: Array<{ caller: string; html: string }> = [];
    const noteIdToIdx = new Map<number, number>();
    function footnoteIdx(noteId: number): { idx: number; caller: string } {
        const existing = noteIdToIdx.get(noteId);
        if (existing != null) return { idx: existing, caller: footnotes[existing].caller };
        const fn = rawFootnotes.find((f) => f.noteId === noteId);
        const idx = footnotes.length;
        const caller = fn?.caller || `${idx + 1}`;
        footnotes.push({ caller, html: esc(fn?.text ?? '') });
        noteIdToIdx.set(noteId, idx);
        return { idx, caller };
    }

    const parts: string[] = [];
    // Consecutive prose (non-poem) verses are batched into one flowing
    // <p class="usfm-p">, matching the sofria renderer's paragraph style;
    // a heading/subtitle/poem line always starts a fresh block.
    let proseBuffer: string[] = [];
    function flushProse() {
        if (proseBuffer.length === 0) return;
        parts.push(`<p class="usfm-p">${proseBuffer.join(' ')}</p>`);
        proseBuffer = [];
    }

    for (const item of content) {
        if (item.type === 'heading') {
            flushProse();
            const text = (item as { content: string[] }).content.join(' ');
            parts.push(`<h3 class="s">${esc(text)}</h3>`);
            continue;
        }
        if (item.type === 'hebrew_subtitle') {
            flushProse();
            const text = (item as { content: string[] }).content.join(' ');
            parts.push(`<p class="d">${esc(text)}</p>`);
            continue;
        }
        if (item.type !== 'verse') continue; // line_break (top-level): no visual effect needed

        const vNum = (item as { number: number }).number;
        const vContent = (item as { content: HelloaoContentItem[] }).content;
        const lines = renderVerse(vNum, vContent, footnoteIdx);
        const isPoetry = lines.some((l) => l.poem != null);

        if (!isPoetry) {
            proseBuffer.push(
                `<span class="verse-block" data-v="${vNum}">${lines.map((l) => l.html).join(' ')}</span>`
            );
            continue;
        }
        flushProse();
        for (const line of lines) {
            const level = line.poem && line.poem >= 1 && line.poem <= 3 ? line.poem : 1;
            parts.push(`<p class="q${level}"><span class="verse-block" data-v="${vNum}">${line.html}</span></p>`);
        }
    }
    flushProse();

    if (parts.length === 0) return { html: '<p>No English text available.</p>', footnotes: [], xrefs: [] };

    return {
        html: parts.join('\n'),
        footnotes,
        xrefs: []
    };
}
