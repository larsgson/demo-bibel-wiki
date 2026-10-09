import { describe, expect, it } from 'vitest'
import { extractVerses, getTextForReference } from './bible-utils'

// chapterVerses() output: string labels, a DBT/PKF range verse kept whole.
const CHAPTER = [
  { label: '1', num: 1, text: 'one' },
  { label: '2-3', num: 2, text: 'two-three' },
  { label: '4a', num: 4, text: 'four' },
  { label: '5', num: 5, text: 'five' },
]

describe('extractVerses with string labels', () => {
  it('selects a range, including a range verse that overlaps it', () => {
    expect(extractVerses(CHAPTER, 3, 4)).toBe('two-three four')
  })

  it('selects listed verses, a range verse once', () => {
    expect(extractVerses(CHAPTER, undefined, undefined, [2, 3, 5])).toBe('two-three five')
  })

  it('selects a single verse inside a range label', () => {
    expect(extractVerses(CHAPTER, 3, 3)).toBe('two-three')
  })
})

describe('getTextForReference', () => {
  it('reads from the chapterText map by BOOK.chapter', () => {
    expect(getTextForReference('JHN 3:1-2', { 'JHN.3': CHAPTER })).toBe('one two-three')
  })
})
