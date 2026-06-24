import { apiFetch } from './client';
import type { BranchedSearchResponse } from './types';

export interface BranchedSearchParams {
    q: string;
    lang?: string;
    book?: string;
    source?: 'door43' | 'aquifer' | 'all';
    per_branch?: number;
    semantic?: boolean;
    force?: string[];
}

const MOCK_RESPONSE: BranchedSearchResponse = {
    query: "", lang: "es", semantic: false,
    analysis: { fts_query: "", passages: [], tags: [], intent: "thematic" },
    suggested_drilldown: [
        { key: "verses", label: "Versículos", total: 47 },
        { key: "morphology", label: "Morfología", total: 3 },
        { key: "methodology", label: "Metodología", total: 2 },
    ],
    branches: [
        {
            key: "lexicon", label: "Léxico / palabras", featured: true, total: 14,
            items: [
                { chunk_id: "abc001:0", title: "ágape (G0026)", kind: "lexicon", passage: null as any, tags: ["kind:lexicon"], excerpt: "ágape — amor incondicional y sacrificial. Se usa principalmente para describir el amor de Dios hacia la humanidad y el amor que los creyentes deben tener entre sí.", primary_path: "/en/strongs/G0026", permalink: "/c/abc001:0", score: 0.842, retrievers: ["semantic"] },
                { chunk_id: "abc002:0", title: "philéō (G5368)", kind: "lexicon", passage: null as any, tags: ["kind:lexicon"], excerpt: "philéō — amor de amistad o afecto fraternal. A diferencia de ágape, este término expresa el amor natural entre personas que se conocen bien.", primary_path: "/en/strongs/G5368", permalink: "/c/abc002:0", score: 0.791, retrievers: ["semantic"] },
            ],
        },
        {
            key: "terms", label: "Términos clave", featured: true, total: 8,
            items: [
                { chunk_id: "abc003:0", title: "TW — Love (kt)", kind: "term", passage: "Juan 3:16", tags: ["kind:term"], excerpt: "Amar a otra persona es cuidar de esa persona y hacer cosas que la puedan beneficiar. El tipo de amor que viene de Dios está enfocado en el bien de otros.", primary_path: "/es/terms/kt/love", permalink: "/c/abc003:0", score: 0.934, retrievers: ["term_anchor"] },
                { chunk_id: "abc004:0", title: "TW — Grace (kt)", kind: "term", passage: "Efesios 2:8", tags: ["kind:term"], excerpt: "La gracia es el favor inmerecido de Dios. Dios da su gracia a las personas aunque no la merezcan.", primary_path: "/es/terms/kt/grace", permalink: "/c/abc004:0", score: 0.812, retrievers: ["semantic"] },
            ],
        },
        {
            key: "study", label: "Notas de estudio", featured: true, total: 11,
            items: [
                { chunk_id: "abc005:0", title: "Nota de traducción — 1 Corintios 13:4", kind: "translator-note", passage: "1 Corintios 13:4", tags: ["kind:translator-note"], excerpt: "El amor es sufrido: la palabra griega aquí es makrothymía, que significa paciencia a largo plazo. Se puede traducir como 'el amor tiene paciencia'.", primary_path: "/en/1CO/13/4", permalink: "/c/abc005:0", score: 0.778, retrievers: ["fts"] },
                { chunk_id: "abc006:0", title: "Nota de traducción — Juan 3:16", kind: "translator-note", passage: "Juan 3:16", tags: ["kind:translator-note"], excerpt: "De tal manera amó Dios: la palabra griega ágape expresa el amor más profundo.", primary_path: "/en/JHN/3/16", permalink: "/c/abc006:0", score: 0.754, retrievers: ["fts"] },
            ],
        },
        {
            key: "verses", label: "Versículos", featured: false, total: 47,
            items: [
                { chunk_id: "abc007:0", title: "Juan 3:16", kind: "bible", passage: "Juan 3:16", tags: ["kind:bible"], excerpt: "Porque de tal manera amó Dios al mundo, que ha dado a su Hijo unigénito, para que todo aquel que en él cree, no se pierda, mas tenga vida eterna.", primary_path: "/es/scripture/nt/JHN/3/16", permalink: "/c/abc007:0", score: 0.891, retrievers: ["semantic"] },
                { chunk_id: "abc008:0", title: "1 Corintios 13:13", kind: "bible", passage: "1 Corintios 13:13", tags: ["kind:bible"], excerpt: "Y ahora permanecen la fe, la esperanza y el amor, estos tres; pero el mayor de ellos es el amor.", primary_path: "/es/scripture/nt/1CO/13/13", permalink: "/c/abc008:0", score: 0.867, retrievers: ["semantic"] },
            ],
        },
        { key: "morphology", label: "Morfología", featured: false, total: 3, items: [] },
        { key: "methodology", label: "Metodología", featured: false, total: 2, items: [] },
        { key: "media", label: "Recursos", featured: false, total: 0, items: [] },
        { key: "other", label: "Otros", featured: false, total: 0, items: [] },
    ],
}

// TODO: remove mock once server is back
const USE_MOCK = false

export function searchBranched(params: BranchedSearchParams): Promise<BranchedSearchResponse> {
    if (USE_MOCK) {
        return new Promise((resolve) => setTimeout(() => resolve({ ...MOCK_RESPONSE, query: params.q }), 600))
    }
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) {
        if (k === 'force') continue;
        if (v !== undefined && v !== null) qs.set(k, String(v));
    }
    if (params.force?.length) qs.set('force', params.force.join(','));
    return apiFetch<BranchedSearchResponse>(`/api/search/branched?${qs}`);
}
