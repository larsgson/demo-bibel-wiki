import type { SofriaDoc, SofriaBlock, SofriaContent } from './sofria';

/**
 * Excerpt a SofriaDoc down to only the verses a predicate accepts (e.g. a
 * single reference's verse range or an explicit verse list) — used to embed
 * a Bible-reader-IDENTICAL rendering (verse numbers, paragraph/poetry
 * structure, headings) of a referenced passage inside a story section,
 * instead of the flattened, verse-number-less string
 * getTextForReference/extractVerses produces. The result still goes
 * through the normal renderSofria — this only prunes the input doc, no
 * new rendering logic.
 *
 * Recursively walks paragraph content: a `wrapper/verses` node is kept
 * whole (verbatim, footnotes/xrefs and all) when its own verse number
 * passes the predicate, dropped otherwise; any OTHER wrapper (e.g. a
 * `wrapper/chapter` — DBT's own text_json nests verses one level deeper
 * than PKF's flatter shape — or `wrapper/usfm:wj`) is kept only if
 * filtering its own content leaves something behind, so both real Sofria
 * shapes seen in this codebase are handled without special-casing either.
 * A paragraph with nothing left after filtering is dropped entirely.
 *
 * Top-level grafts (headings) carry no verse number of their own — one
 * immediately preceding an included paragraph (in original doc order) is
 * kept (it introduces that passage); any other is dropped. This lets a
 * true section heading survive when the excerpt starts right where it
 * would in the full chapter, without ever including a heading whose own
 * passage falls outside the excerpt.
 */

function filterContentArray(
    content: SofriaContent[],
    includeVerse: (num: number) => boolean
): { kept: SofriaContent[]; includedAny: boolean } {
    const kept: SofriaContent[] = [];
    let includedAny = false;

    for (const item of content) {
        if (typeof item === 'string' || item.type === 'mark') {
            kept.push(item);
            continue;
        }
        if (item.type === 'wrapper' && item.subtype === 'verses') {
            const num = parseInt(String(item.atts?.number ?? ''), 10);
            if (Number.isFinite(num) && includeVerse(num)) {
                kept.push(item);
                includedAny = true;
            }
            continue;
        }
        if (item.type === 'wrapper') {
            const inner = filterContentArray(item.content ?? [], includeVerse);
            if (inner.includedAny) {
                kept.push({ ...item, content: inner.kept });
                includedAny = true;
            }
            continue;
        }
        // Inline graft (footnote/xref/note_caller) — no verse number of its
        // own; passes through structurally, dropped along with everything
        // else if this array ends up with no included verse at all.
        kept.push(item);
    }

    return { kept: includedAny ? kept : [], includedAny };
}

export function excerptSofriaDoc(doc: SofriaDoc, includeVerse: (num: number) => boolean): SofriaDoc {
    const outBlocks: SofriaBlock[] = [];
    let pendingGrafts: SofriaBlock[] = [];

    for (const block of doc.sequence.blocks ?? []) {
        if (block.type === 'graft') {
            pendingGrafts.push(block);
            continue;
        }
        const { kept, includedAny } = filterContentArray(block.content, includeVerse);
        if (includedAny) {
            outBlocks.push(...pendingGrafts, { ...block, content: kept });
        }
        pendingGrafts = [];
    }

    return { sequence: { ...doc.sequence, blocks: outBlocks } };
}

/** Predicate builder for the common "verseStart..verseEnd" range case —
 *  see bible-utils.ts's ParsedReference, which carries either this OR an
 *  explicit `verses` list (use `(n) => verses.includes(n)` for that case). */
export function verseRangeIncludes(verseStart?: number, verseEnd?: number): (num: number) => boolean {
    const start = verseStart ?? 0;
    const end = verseEnd ?? Number.POSITIVE_INFINITY;
    return (num: number) => num >= start && num <= end;
}
