/**
 * Glossary loader for languages that ship a dedicated glossary book in the
 * pkf (typically bookCode GLO; some SAB deployments use XXA / XXD). Each
 * glossary paragraph has its headword wrapped in a `\k ... \k*` (Proskomma
 * scope `span/k`); the rest of the paragraph is the definition.
 *
 * We walk the glossary book once per language on first glossary-term click
 * and build a Map<normalized-term, { term, definition }> for O(1) lookups.
 */

export type GlossaryEntry = {
    /** The head term as it appears in the source. */
    term: string;
    /** Plain-text definition (glossary paragraph minus the head term). */
    definition: string;
};

export type Glossary = Map<string, GlossaryEntry>;

const GLOSSARY_BOOK_CODES = ['GLO', 'XXA', 'XXD'];

type ProskommaLike = {
    gqlQuerySync: (q: string) => { data?: unknown; errors?: unknown };
};

/** Strip diacritics, whitespace, and punctuation; lowercase. Used as the
 *  lookup key so "Jesús" / "JESUS " both resolve to "jesus". */
export function normalizeTerm(s: string): string {
    return s
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^\p{L}\p{N}]/gu, '')
        .toLowerCase();
}

export function lookup(glossary: Glossary | null, term: string): GlossaryEntry | null {
    if (!glossary) return null;
    return glossary.get(normalizeTerm(term)) ?? null;
}

type Block = {
    items: Array<{ type: string; subType: string; payload: string }>;
};

export function loadGlossary(pk: ProskommaLike, docSetId: string): Glossary {
    const map: Glossary = new Map();
    try {
        const docsQ = pk.gqlQuerySync(
            `{docSet(id:"${docSetId}"){documents{bc:header(id:"bookCode")}}}`
        );
        const docs = (docsQ.data as { docSet?: { documents?: Array<{ bc?: string }> } })?.docSet
            ?.documents;
        if (!docs) return map;
        const gloDoc = docs.find((d) => d.bc && GLOSSARY_BOOK_CODES.includes(d.bc));
        if (!gloDoc?.bc) return map;

        const q = pk.gqlQuerySync(
            `{docSet(id:"${docSetId}"){document(bookCode:"${gloDoc.bc}"){mainSequence{blocks{items{type subType payload}}}}}}`
        );
        const blocks = (q.data as {
            docSet?: { document?: { mainSequence?: { blocks?: Block[] } } };
        })?.docSet?.document?.mainSequence?.blocks;
        if (!blocks) return map;

        for (const b of blocks) {
            let inK = 0;
            let term = '';
            let def = '';
            for (const it of b.items) {
                if (it.type === 'scope' && it.payload === 'span/k') {
                    if (it.subType === 'start') inK++;
                    else if (it.subType === 'end') inK--;
                    continue;
                }
                if (it.type !== 'token') continue;
                if (inK > 0) term += it.payload;
                else def += it.payload;
            }
            const key = normalizeTerm(term);
            const definition = def.trim();
            if (key && definition) {
                map.set(key, { term: term.trim(), definition });
            }
        }
    } catch {
        /* swallow — absence of glossary is the common case */
    }
    return map;
}
