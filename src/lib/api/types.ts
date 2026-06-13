export type ChunkId = string;
export type Kind =
    | 'scripture'
    | 'bible'
    | 'translator-note'
    | 'question'
    | 'term'
    | 'methodology'
    | 'study-note'
    | 'book-intro'
    | 'lexicon'
    | 'morphology'
    | 'section-heading'
    | 'video-transcript'
    | 'dictionary'
    | 'ane-context'
    | 'passage-cluster'
    | 'map'
    | 'image'
    | (string & {});

export interface ChunkPreview {
    chunk_id: ChunkId;
    title: string;
    kind: Kind;
    passage: string | null;
    tags: string[];
    excerpt: string;
    primary_path: string;
    permalink: string;
}

export type SearchIntent =
    | 'thematic'
    | 'entity_lookup'
    | 'passage_specific'
    | 'passage_book'
    | 'methodology'
    | 'word-study'
    | 'morphology'
    | 'genealogy'
    | 'ane-context'
    | 'lexicon';

export interface QueryAnalysis {
    fts_query: string;
    passages: [number, number][];
    tags: string[];
    intent: SearchIntent;
}

export interface SearchHit extends ChunkPreview {
    score: number;
    retrievers: string[];
}

export interface SearchResponse {
    query: string;
    lang: string;
    filters: Record<string, string | null>;
    semantic: boolean;
    analysis: QueryAnalysis;
    hits: SearchHit[];
    total: number;
}

export interface Citation extends ChunkPreview {
    n: number;
    original_words?: {
        lang: string;
        words: { surface: string; strong: string; gloss: string }[];
    };
}

export interface AskResponse {
    question: string;
    answer: string;
    citations: Citation[];
    confidence: number;
    lang: string;
    analysis: QueryAnalysis;
}

export interface TreeNode {
    id: string;
    label: string;
    child_count?: number;
    url: string;
    children?: TreeNode[];
}

export interface AllTreesResponse {
    lang: string;
    trees: Record<string, TreeBranch>;
}

export interface TreeBranch {
    tree: string;
    lang: string;
    node: {
        id?: string;
        label?: string;
        passage?: string;
        bbcccvvv?: number;
        testament?: 'ot' | 'nt';
        section_heading?: string;
    };
    children?: TreeNode[];
    chunks?: ChunkPreview[];
}

export interface Chunk extends ChunkPreview {
    doc_id: string;
    body: string;
    passage_refs: [number, number][];
    all_paths: string[];
    cross_refs: {
        passage?: ChunkPreview[];
        support_ref?: ChunkPreview[];
        term?: ChunkPreview[];
    };
}
