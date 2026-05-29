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

export interface TemplateStructure {
  name: string
  image: string
  layoutTheme: string | null
  imageConfig: ImageConfig | null
  categories: TemplateCategory[]
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
