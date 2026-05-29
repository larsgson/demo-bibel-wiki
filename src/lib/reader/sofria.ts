import { getProskomma } from './store';

/**
 * Sofria JSON returned by Proskomma's `document.sofria(chapter: N)` query.
 * Shape summary (abbreviated to what we actually consume):
 *
 *   { sequence: { type, blocks: [Block] } }
 *
 *   Block     = Paragraph | Graft
 *   Paragraph = { type: "paragraph", subtype: "usfm:p" | "usfm:q1" | ..., content: [Content] }
 *   Graft     = { type: "graft", subtype: "title" | "heading" | "footnote" | ..., sequence: InnerSeq }
 *
 *   Content   = string
 *             | { type: "mark",    subtype: "verses_label" | "chapter_label", atts: { number } }
 *             | { type: "wrapper", subtype: "chapter" | "verses" | "usfm:wj" | ..., content: [Content] }
 *             | { type: "graft",   subtype: "footnote" | "xref" | "note_caller", sequence: InnerSeq }
 *
 *   InnerSeq  = { type, blocks: [Block] }   -- recursive
 */

export type SofriaDoc = {
    sequence: SofriaSeq;
};

type SofriaSeq = {
    type: string;
    blocks?: SofriaBlock[];
};

type SofriaBlock =
    | { type: 'paragraph'; subtype?: string; content: SofriaContent[] }
    | { type: 'graft'; subtype?: string; sequence: SofriaSeq };

type SofriaContent =
    | string
    | { type: 'mark'; subtype?: string; atts?: Record<string, string> }
    | {
          type: 'wrapper';
          subtype?: string;
          content?: SofriaContent[];
          atts?: Record<string, string | string[]>;
      }
    | { type: 'graft'; subtype?: string; sequence: SofriaSeq };

export function fetchSofria(
    docSetId: string,
    bookCode: string,
    chapter: number
): SofriaDoc {
    const pk = getProskomma();
    const q = `{
        docSet(id: "${docSetId}") {
            document(bookCode: "${bookCode}") {
                sofria(chapter: ${chapter})
            }
        }
    }`;
    const result = pk.gqlQuerySync(q);
    const raw = result?.data?.docSet?.document?.sofria;
    if (!raw) throw new Error(`No sofria for ${bookCode} ${chapter}`);
    return JSON.parse(raw) as SofriaDoc;
}

// ----- Rendering Sofria → HTML string with USFM-conventional class names -----

const escMap: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
};
function esc(s: string): string {
    return s.replace(/[&<>"']/g, (c) => escMap[c]);
}

function usfmMarker(subtype: string | undefined): string {
    if (!subtype) return '';
    return subtype.startsWith('usfm:') ? subtype.slice(5) : subtype;
}

/** Flatten the plain text of a Sofria inline-content list, ignoring marks
 *  and drilling into nested wrappers. Used to derive `data-term` for
 *  glossary-term buttons. */
function extractPlainText(items: SofriaContent[] | undefined): string {
    if (!items) return '';
    let out = '';
    for (const it of items) {
        if (typeof it === 'string') out += it;
        else if (it && (it as { type?: string }).type === 'wrapper') {
            out += extractPlainText((it as { content?: SofriaContent[] }).content);
        }
    }
    return out.trim();
}

/**
 * Display mode for figure captions.
 *   'show'      — always render the caption below the image.
 *   'hide'      — never render the caption (keeps it as img alt for a11y).
 *   'heuristic' — render the caption only if it does NOT look like English.
 *
 * Configured per-ISO via config/figure_captions.json.
 */
export type CaptionMode = 'show' | 'hide' | 'heuristic';

/**
 * Minimal shape the renderer needs to emit inline video thumbnails at the
 * right verse boundaries. (Reader.svelte supplies these from its MediaManifest
 * — we don't import the full type to keep sofria.ts self-contained.)
 */
export type InlineVideo = {
    id: string;
    title: string;
    kind: string;
    thumbnailUrl: string | null;
    placement: {
        bookCode?: string;
        chapter?: number;
        verse?: number | null;
        pos?: string | null;
    };
};

type RenderCtx = {
    /** Footnote objects collected inline, flushed to a list after the chapter. */
    footnotes: Array<{ caller: string; html: string }>;
    /** Cross-ref objects collected inline. */
    xrefs: Array<{ caller: string; html: string }>;
    /** Map from pkf-encoded figure filename to hosted URL. */
    figureUrls: Record<string, string>;
    /** How to treat embedded figure captions for this language. */
    captionMode: CaptionMode;
    /** Videos with a `placement.verse` — emitted inline at verse boundaries. */
    inlineVideos: InlineVideo[];
};

/**
 * Small closed-class English stopword set. Captions from the Lumo / RG /
 * Sweet Publishing illustration packs typically contain multiple of these
 * ("Jesus passes by John and 2 others", "with", "from"). Indigenous Mexican
 * languages share essentially none of these orthographies, so presence of
 * any of them in a caption is a strong signal the caption is untranslated
 * English stock text rather than the scripture's own language.
 */
const EN_STOPWORDS = new Set([
    'the', 'and', 'of', 'is', 'in', 'with', 'by', 'for', 'from', 'to',
    'a', 'an', 'at', 'or', 'but', 'as', 'on',
    'this', 'that', 'these', 'those', 'it', 'its',
    'are', 'was', 'were', 'be', 'been', 'being',
    'has', 'have', 'had', 'not',
    'he', 'she', 'him', 'her', 'his', 'they', 'them', 'their',
    'we', 'us', 'our', 'you', 'your', 'i', 'me', 'my',
    'will', 'would', 'could', 'should', 'may', 'might', 'can',
    'do', 'does', 'did', 'over', 'into'
]);

function looksLikeEnglish(s: string): boolean {
    const words = s.toLowerCase().match(/[a-z']+/g) ?? [];
    if (words.length < 2) return false;
    const en = words.filter((w) => EN_STOPWORDS.has(w)).length;
    return en / words.length >= 0.15;
}

function shouldShowCaption(caption: string, mode: CaptionMode): boolean {
    if (!caption) return false;
    if (mode === 'hide') return false;
    if (mode === 'show') return true;
    return !looksLikeEnglish(caption);
}

/** Render a verses_label (verse number). Matches SE's `.v` span convention,
 *  which uses relative positioning rather than <sup> so the baseline shift
 *  is controlled by CSS. */
function renderVerseMark(atts?: Record<string, string>): string {
    const n = atts?.number ?? '';
    return `<span class="v" data-v="${esc(n)}">${esc(n)}</span>`;
}

/** Render a chapter_label (chapter number) as a drop-cap matching SE's
 *  `.c-drop` convention — float-left, large, in the titles color. */
function renderChapterMark(atts?: Record<string, string>): string {
    const n = atts?.number ?? '';
    return `<span class="c-drop" data-c="${esc(n)}">${esc(n)}</span>`;
}

export function renderInlineVideos(
    videos: InlineVideo[] | undefined,
    verse: number,
    pos: 'before' | 'after'
): string {
    if (!videos || videos.length === 0) return '';
    const parts: string[] = [];
    for (const v of videos) {
        if (v.placement?.verse !== verse) continue;
        // Default placement is 'after' when not specified.
        const vpos = v.placement?.pos === 'before' ? 'before' : 'after';
        if (vpos !== pos) continue;
        const style = v.thumbnailUrl ? ` style="background-image:url(${esc(v.thumbnailUrl)})"` : '';
        parts.push(
            `<span class="reader-inline-video" data-video-id="${esc(v.id)}" role="button" tabindex="0"${style}>` +
                `<span class="reader-video-play" aria-hidden="true">\u25b6</span>` +
                `<span class="reader-video-kind">${esc(v.kind)}</span>` +
                `<span class="reader-video-title">${esc(v.title)}</span>` +
                `</span>`
        );
    }
    return parts.join('');
}

function renderInlineContent(items: SofriaContent[] | undefined, ctx: RenderCtx): string {
    if (!items) return '';
    let out = '';
    for (const it of items) {
        if (typeof it === 'string') {
            out += esc(it);
            continue;
        }
        if (it.type === 'mark') {
            if (it.subtype === 'verses_label') out += renderVerseMark(it.atts);
            else if (it.subtype === 'chapter_label') out += renderChapterMark(it.atts);
            continue;
        }
        if (it.type === 'wrapper') {
            const st = it.subtype ?? '';
            // `chapter` wrapper carries scope without adding visual markup.
            if (st === 'chapter') {
                out += renderInlineContent(it.content, ctx);
                continue;
            }
            // `verses` wrapper knows its verse number via atts. We wrap the
            // verse content in <span class="verse-block" data-v="N"> so SE's
            // verse-rhythm CSS applies and we can implement tap-to-select
            // without re-rendering.
            if (st === 'verses') {
                const rawNum = (it.atts as Record<string, string | string[]> | undefined)?.[
                    'number'
                ];
                const num = parseInt(Array.isArray(rawNum) ? rawNum[0] : String(rawNum ?? ''), 10);
                const attr = Number.isFinite(num) ? ` data-v="${num}"` : '';
                if (Number.isFinite(num)) out += renderInlineVideos(ctx.inlineVideos, num, 'before');
                out += `<span class="verse-block"${attr}>${renderInlineContent(it.content, ctx)}</span>`;
                if (Number.isFinite(num)) out += renderInlineVideos(ctx.inlineVideos, num, 'after');
                continue;
            }
            // Character-style wrappers: emit a bare USFM-marker span (wj/nd/k/
            // bd/…) to match SE's class naming exactly — no `.char` parent.
            const marker = usfmMarker(st);
            const inner = renderInlineContent(it.content, ctx);
            // \w and \k mark glossary-linkable terms. Emit a button so Reader
            // can detect clicks and resolve against the loaded glossary map.
            if (marker === 'w' || marker === 'k') {
                const plain = extractPlainText(it.content);
                out += `<button type="button" class="${esc(marker)} glossary-term" data-term="${esc(
                    plain.toLowerCase()
                )}">${inner}</button>`;
            } else {
                out += `<span class="${esc(marker)}">${inner}</span>`;
            }
            continue;
        }
        if (it.type === 'graft') {
            if (it.subtype === 'fig') {
                out += renderFigure(it.sequence, ctx);
                continue;
            }
            if (it.subtype === 'footnote') {
                const { caller, bodyHtml } = renderNoteSeq(it.sequence, ctx);
                const idx = ctx.footnotes.length;
                ctx.footnotes.push({ caller: caller || `${idx + 1}`, html: bodyHtml });
                out += `<button type="button" class="note-caller" data-note-idx="${idx}" aria-label="Footnote">${esc(
                    caller || `${idx + 1}`
                )}</button>`;
                continue;
            }
            if (it.subtype === 'xref') {
                const { caller, bodyHtml } = renderNoteSeq(it.sequence, ctx);
                const idx = ctx.xrefs.length;
                ctx.xrefs.push({ caller: caller || `${idx + 1}`, html: bodyHtml });
                out += `<button type="button" class="xref-caller" data-xref-idx="${idx}" aria-label="Cross-reference">${esc(
                    caller || `${idx + 1}`
                )}</button>`;
                continue;
            }
            // Other inline grafts (note_caller handled inside renderNoteSeq): ignore.
        }
    }
    return out;
}

/**
 * Extract {filename, caption} from a Sofria `fig` graft sequence.
 * The structure produced by Proskomma is:
 *   sequence.blocks[0] = paragraph, subtype "usfm:f"
 *   .content[0]        = wrapper,   subtype "usfm:fig"
 *                         .content  = [captionText] (or ["NO_CAPTION"])
 *                         .atts.unknownDefault_fig = [src, size, loc, copy, captionAttr, ref]
 */
function extractFigure(seq: SofriaSeq): { filename: string | null; caption: string } {
    const block = seq.blocks?.[0];
    if (!block || block.type !== 'paragraph') return { filename: null, caption: '' };
    const first = block.content?.[0];
    if (!first || typeof first === 'string' || first.type !== 'wrapper') {
        return { filename: null, caption: '' };
    }
    const attsList = first.atts?.['unknownDefault_fig'];
    const attsArr = Array.isArray(attsList) ? attsList : [];
    const filename = (attsArr[0] ?? null) as string | null;

    let caption = '';
    for (const c of first.content ?? []) {
        if (typeof c === 'string') caption += c;
    }
    caption = caption.trim();
    if (caption === 'NO_CAPTION') caption = '';
    if (!caption && typeof attsArr[4] === 'string') caption = attsArr[4].trim();

    return { filename, caption };
}

/**
 * Emit markup for an inline figure. Uses a <span class="fig"> (phrasing
 * content — valid inside <p>) with display:block styling in reader.css.
 *
 * The caption is rendered according to ctx.captionMode; it's always kept as
 * the image's `alt` attribute regardless of mode, for a11y and for the
 * broken-image fallback.
 */
function renderFigure(seq: SofriaSeq, ctx: RenderCtx): string {
    const { filename, caption } = extractFigure(seq);
    if (!filename) return '';
    const url = ctx.figureUrls[filename] ?? null;
    // No URL mapped → render nothing (matches Scripture Earth's graceful
    // fallback: SE emits an <img> and then hides it via display:none when
    // a HEAD-check fails). Since our map_figures.mjs only records URLs
    // that resolved against the live service-worker asset list, "no URL"
    // reliably means "image does not exist in this deployment" — safe to
    // skip emission entirely.
    if (!url) return '';
    const altText = caption || filename;
    const captionHtml = shouldShowCaption(caption, ctx.captionMode)
        ? `<span class="fig-caption">${esc(caption)}</span>`
        : '';
    return (
        `<span class="fig" data-src="${esc(filename)}">` +
        `<img src="${esc(url)}" alt="${esc(altText)}" loading="lazy" decoding="async">` +
        captionHtml +
        `</span>`
    );
}

/**
 * Render a footnote / xref inner sequence. Returns the "caller" (the symbol
 * like "+", "a", "*") pulled out of its note_caller graft, and the body HTML
 * of the rest of the note.
 */
function renderNoteSeq(
    seq: SofriaSeq,
    ctx: RenderCtx
): { caller: string; bodyHtml: string } {
    let caller = '';
    const parts: string[] = [];
    for (const block of seq.blocks ?? []) {
        if (block.type !== 'paragraph') continue;
        for (const it of block.content ?? []) {
            if (typeof it === 'object' && it.type === 'graft' && it.subtype === 'note_caller') {
                // caller is the plain text of the note_caller sequence
                caller = pullText(it.sequence);
                continue;
            }
            parts.push(renderInlineContent([it], ctx));
        }
    }
    return { caller, bodyHtml: parts.join('').trim() };
}

/** Collect all plain text out of a simple sequence (used for note_caller). */
function pullText(seq: SofriaSeq): string {
    const buf: string[] = [];
    function walk(items: SofriaContent[] | undefined) {
        if (!items) return;
        for (const it of items) {
            if (typeof it === 'string') buf.push(it);
            else if (it.type === 'wrapper') walk(it.content);
            else if (it.type === 'graft') for (const b of it.sequence.blocks ?? [])
                if (b.type === 'paragraph') walk(b.content);
        }
    }
    for (const b of seq.blocks ?? []) if (b.type === 'paragraph') walk(b.content);
    return buf.join('').trim();
}

function renderParagraph(
    block: { type: 'paragraph'; subtype?: string; content: SofriaContent[] },
    ctx: RenderCtx
): string {
    const marker = usfmMarker(block.subtype) || 'p';
    return `<p class="${esc(marker)}">${renderInlineContent(block.content, ctx)}</p>`;
}

/** Pick a semantic element for a USFM top-of-page / section marker. */
function elementForMarker(marker: string): 'h2' | 'h3' | 'p' {
    if (/^mt[0-9]?$/.test(marker) || marker === 'mr') return 'h2';
    if (/^m?s[0-9]?$/.test(marker)) return 'h3';
    return 'p';
}

function renderTitleSeq(seq: SofriaSeq, ctx: RenderCtx): string {
    const parts: string[] = [];
    for (const b of seq.blocks ?? []) {
        if (b.type !== 'paragraph') continue;
        const marker = usfmMarker(b.subtype) || 'p';
        const tag = elementForMarker(marker);
        parts.push(
            `<${tag} class="${esc(marker)}">${renderInlineContent(b.content, ctx)}</${tag}>`
        );
    }
    return parts.join('');
}

export type RenderedChapter = {
    html: string;
    footnotes: Array<{ caller: string; html: string }>;
    xrefs: Array<{ caller: string; html: string }>;
};

/**
 * Walk the top-level Sofria sequence and emit an HTML string.
 * Titles/headings at the top of the chapter become <h2>/<h3>; main-sequence
 * paragraphs become <p class="{usfm-marker}">…</p>; footnotes and xrefs are
 * collected and emitted after the body.
 */
export function renderSofria(
    doc: SofriaDoc,
    figureUrls: Record<string, string> = {},
    captionMode: CaptionMode = 'hide',
    inlineVideos: InlineVideo[] = []
): RenderedChapter {
    const ctx: RenderCtx = {
        footnotes: [],
        xrefs: [],
        figureUrls,
        captionMode,
        inlineVideos
    };
    const parts: string[] = [];
    for (const block of doc.sequence.blocks ?? []) {
        if (block.type === 'graft') {
            const st = block.subtype;
            if (st === 'title' || st === 'heading' || st === 'remark') {
                parts.push(renderTitleSeq(block.sequence, ctx));
            }
            // other top-level grafts (intro etc.) ignored for now
            continue;
        }
        if (block.type === 'paragraph') {
            parts.push(renderParagraph(block, ctx));
        }
    }
    return { html: parts.join('\n'), footnotes: ctx.footnotes, xrefs: ctx.xrefs };
}
