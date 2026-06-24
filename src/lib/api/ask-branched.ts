import { apiFetch } from './client';
import type { BranchedAskResponse } from './types';

// TODO: remove mock once server is back
const USE_MOCK = false

const MOCK_RESPONSE: BranchedAskResponse = {
    question: "",
    answer: "La Biblia describe varios tipos de amor. El **ágape** [abc001:0] es el amor incondicional y sacrificial de Dios hacia la humanidad [abc007:0]. El **philéō** [abc002:0] es el amor de amistad y afecto fraternal entre personas. El **éros** (no aparece en el Nuevo Testamento) representa el amor romántico. En 1 Corintios 13, Pablo describe el amor como sufrido, benigno y que nunca deja de ser.",
    confidence: "high",
    citations: ["abc001:0", "abc003:0", "abc007:0"],
    suggested_drilldown: [
        { key: "verses", label: "Versículos", total: 47 },
        { key: "morphology", label: "Morfología", total: 3 },
    ],
    analysis: { fts_query: "amor tipos", passages: [], tags: ["love", "agape"], intent: "thematic" },
    branches: [
        {
            key: "lexicon", label: "Léxico / palabras", featured: true, total: 14,
            items: [
                { chunk_id: "abc001:0", title: "ágape (G0026)", kind: "lexicon", passage: null as any, tags: ["kind:lexicon"], excerpt: "ágape — amor incondicional y sacrificial. Se usa principalmente para describir el amor de Dios hacia la humanidad.", primary_path: "/en/strongs/G0026", permalink: "/c/abc001:0", score: 0.842, retrievers: ["semantic"] },
                { chunk_id: "abc002:0", title: "philéō (G5368)", kind: "lexicon", passage: null as any, tags: ["kind:lexicon"], excerpt: "philéō — amor de amistad o afecto fraternal. A diferencia de ágape, este término expresa el amor natural entre personas.", primary_path: "/en/strongs/G5368", permalink: "/c/abc002:0", score: 0.791, retrievers: ["semantic"] },
            ],
        },
        {
            key: "verses", label: "Versículos", featured: false, total: 47,
            items: [
                { chunk_id: "abc007:0", title: "Juan 3:16", kind: "bible", passage: "Juan 3:16", tags: ["kind:bible"], excerpt: "Porque de tal manera amó Dios al mundo, que ha dado a su Hijo unigénito.", primary_path: "/es/scripture/nt/JHN/3/16", permalink: "/c/abc007:0", score: 0.891, retrievers: ["semantic"] },
            ],
        },
        { key: "morphology", label: "Morfología", featured: false, total: 3, items: [] },
    ],
}

export interface BranchedAskParams {
    question: string;
    lang?: string;
    book?: string;
    source?: 'door43' | 'aquifer' | 'all';
    per_branch?: number;
    force?: string[];
    password?: string;
}

export function askBranched(params: BranchedAskParams): Promise<BranchedAskResponse> {
    if (USE_MOCK) {
        return new Promise((resolve) => setTimeout(() => resolve({ ...MOCK_RESPONSE, question: params.question }), 1200))
    }
    const { password, ...body } = params;
    return apiFetch<BranchedAskResponse>('/api/ask/branched', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
        authed: true,
        password,
    });
}
