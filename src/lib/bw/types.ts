export interface TemplateStory {
  id: string
  chapter: number
  image: string
}

export interface TemplateCategory {
  id: string
  image: string
  stories: TemplateStory[]
}

export interface ImageConfig {
  base_url: string
  thumbs_url?: string
  thumbs_resize?: string
  path_pattern?: string
  thumbs_pattern?: string
  medium_pattern?: string
}

export interface VideoConfig {
  base_url: string
}

export interface TemplateStructure {
  name: string
  image: string
  layoutTheme: string | null
  imageConfig: ImageConfig | null
  videoConfig: VideoConfig | null
  categories: TemplateCategory[]
  /** True for a template whose story text/images/audio/timing are resolved
   *  LIVE from cdn.bibel.wiki's OBS catalog + door43.org at read time (e.g.
   *  OBS-UW), not baked in at build time from local .md files — see
   *  src/lib/bw/door43-obs.ts. Per-language availability and resolved URLs
   *  come entirely from that live catalog, not from anything local. */
  door43: boolean
}

export interface StoryMeta {
  title: string
  description: string
}

export interface CategoryMeta {
  title: string
  description: string
}

export interface LocaleData {
  bookTitle: string
  categories: Record<string, CategoryMeta>
  stories: Record<string, StoryMeta>
  sections: Record<string, Record<string, string>>
}

export interface VerseEntry {
  verseStart: number
  verseEnd: number
  startTime: number
  endTime: number
}

export interface ParsedReference {
  book: string
  chapter: number
  verseStart?: number
  verseEnd?: number
  verses?: number[]
}

export interface Section {
  imageUrls: string[]
  text: string
  heading?: string
  reference: string
}

export interface ParsedMarkdown {
  title: string
  sections: Section[]
}
