import type { SofriaContent, SofriaGraft, SofriaParagraph, SofriaWrapper } from '../types';

// Tiny builders for hand-written test docs, in the shape proskomma-core's
// sofria() emits (test-only; production Sofria comes from the sources
// themselves or bibles' vendored converter).

/** A `usfm:<marker>` paragraph ("p", "q1", "d", …). */
export function paragraph(marker: string, content: SofriaContent[]): SofriaParagraph {
    return { type: 'paragraph', subtype: `usfm:${marker}`, content };
}

/** One verse's `verses` wrapper; `withLabel` adds the verse-number mark (only
 *  the first wrapper of a verse split over several paragraphs carries it). */
export function versesWrapper(num: number, content: SofriaContent[], withLabel: boolean): SofriaWrapper {
    const items: SofriaContent[] = withLabel
        ? [{ type: 'mark', subtype: 'verses_label', atts: { number: String(num) } }, ...content]
        : content;
    return { type: 'wrapper', subtype: 'verses', atts: { number: String(num) }, content: items };
}

/** A top-level heading graft (type on `sequence.type`, no `subtype` — as in
 *  real PKF data). */
export function headingGraft(text: string): SofriaGraft {
    return { type: 'graft', sequence: { type: 'heading', blocks: [paragraph('s1', [text])] } };
}

/** An inline footnote graft with its caller in a nested `note_caller` graft. */
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
