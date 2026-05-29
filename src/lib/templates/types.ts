/** Top-level templates the app surfaces. */
export type TemplateName = 'OBS' | 'John' | 'TGS';

export const TEMPLATES: Array<{ name: TemplateName; label: string; description: string }> = [
    { name: 'OBS', label: 'Open Bible Stories', description: '50 stories from creation to revelation' },
    { name: 'John', label: 'Visual Bible — John', description: 'Illustrated Gospel of John' },
    { name: 'TGS', label: 'The Glory Story', description: 'Sweet Publishing storyboards' }
];

export interface ImageConfig {
    base_url: string;
    thumbs_url?: string;
    path_pattern?: string;
    thumbs_pattern?: string;
    medium_pattern?: string;
}

export interface CategoryDef {
    id: string;
    image: string;
}

export interface StoryDef {
    id: string;
    image: string;
}

export interface CategoryIndex {
    id: string;
    canon?: 'nt' | 'ot';
    image: { filename: string };
    stories: StoryDef[];
}

export interface TemplateIndex {
    images: ImageConfig;
    image?: { filename: string };
    /** Either an array of category definitions (TGS/John style) or a list of
     *  category IDs (OBS style). */
    categories: CategoryDef[] | string[];
}

export interface ParsedReference {
    book: string;
    chapter: number;
    verseStart?: number;
    verseEnd?: number;
    verses?: number[];
}

export interface Section {
    imageUrls: string[];
    text: string;
    heading?: string;
    reference: string;
}

export interface ParsedMarkdown {
    title: string;
    sections: Section[];
}

/** Flat lookup: dotted key → string. Built from a parsed locale TOML. */
export type LocaleMap = Record<string, string>;

export interface VerseEntry {
    num: number;
    text: string;
}

/** start, end seconds for a verse, plus the full verseId (e.g. "1a") from the
 *  SE timing TSV file. Indexed by integer verse num for the simple case. */
export interface TimingEntry {
    start: number;
    end: number;
    verseId: string;
}
