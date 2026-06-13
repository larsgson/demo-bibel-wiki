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

// ---- Cross-references ----

export interface CrossRefPassage {
    bbcccvvv: number;
    human: string;
    url: string;
}

export interface CrossReference {
    target_start_bbcccvvv: number;
    target_end_bbcccvvv: number;
    human: string;
    url: string;
    source: string;
    rank: number;
}

export interface CrossReferencesResponse {
    source_passage: CrossRefPassage;
    filters: { source: string | null };
    count: number;
    cross_references: CrossReference[];
}

// ---- Concordance ----

export interface ConcordanceVerse {
    bbcccvvv: number;
    human: string;
    url: string;
    scripture_url: string;
}

export interface ConcordanceResponse {
    word: string;
    word_normalized: string;
    verse_count: number;
    limit: number;
    offset: number;
    verses: ConcordanceVerse[];
}

// ---- Entities ----

export interface EntitySummary {
    id: string;
    type: string;
    name: string;
}

export interface EntityRelation {
    direction: 'incoming' | 'outgoing';
    relation: string;
    target_id: string;
    target_name: string;
    target_type: string;
}

export interface EntityPassage {
    start_bbcccvvv: number;
    end_bbcccvvv: number;
    human: string;
    url: string;
}

export interface EntityDetail extends EntitySummary {
    metadata: Record<string, unknown>;
    relation_count: number;
    relations: EntityRelation[];
    passage_count: number;
    passages: EntityPassage[];
}

export interface EntitiesResponse {
    total: number;
    limit: number;
    offset: number;
    entities: EntitySummary[];
}

// ---- Topics ----

export interface TopicSummary {
    id: string;
    name: string;
    source: string;
}

export interface TopicDetail extends TopicSummary {
    passage_count: number;
    passages: EntityPassage[];
}

export interface TopicsResponse {
    total: number;
    limit: number;
    offset: number;
    topics: TopicSummary[];
}

// ---- Passage (morphological) ----

export interface PassageWord {
    surface: string;
    lemma: string;
    strong: string;
    morph: string;
    gloss: string;
}

export interface PassageVerse {
    verse: number;
    text: string;
    words: PassageWord[];
}

export interface PassageResponse {
    corpus: string;
    book?: string;
    chapter?: number;
    verses: PassageVerse[];
}
