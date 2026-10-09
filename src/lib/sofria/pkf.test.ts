import { describe, expect, it, vi } from 'vitest'
import { pkfChapterSofria, pkfRenderOptions, type SofriaQueryable } from './pkf'
import type { SofriaDoc } from './types'

const chapterDoc: SofriaDoc = {
  sequence: {
    type: 'main',
    blocks: [{ type: 'paragraph', subtype: 'usfm:p', content: ['two'] }],
  },
}

// Whole-book Sofria for a two-chapter book: chapter wrappers say which
// chapter each paragraph's content belongs to.
const bookDoc: SofriaDoc = {
  sequence: {
    type: 'main',
    blocks: [
      { type: 'paragraph', subtype: 'usfm:p', content: [{ type: 'wrapper', subtype: 'chapter', atts: { number: '1' }, content: ['one'] }] },
      { type: 'graft', sequence: { type: 'heading', blocks: [{ type: 'paragraph', subtype: 'usfm:s1', content: ['Heading 2'] }] } },
      { type: 'paragraph', subtype: 'usfm:p', content: [{ type: 'wrapper', subtype: 'chapter', atts: { number: '2' }, content: ['two'] }] },
    ],
  },
}

function stub(chapterResult: () => string | null): SofriaQueryable & { gqlQuerySync: ReturnType<typeof vi.fn> } {
  return {
    gqlQuerySync: vi.fn((q: string) => {
      const sofria = q.includes('sofria(chapter') ? chapterResult() : JSON.stringify(bookDoc)
      return { data: { docSet: { document: { sofria } } } }
    }),
  }
}

describe('pkfChapterSofria', () => {
  it('returns the chapter query result when it works', () => {
    const pk = stub(() => JSON.stringify(chapterDoc))
    expect(pkfChapterSofria(pk, 'x_Y', 'MAT', 2)).toEqual(chapterDoc)
    expect(pk.gqlQuerySync).toHaveBeenCalledTimes(1)
  })

  it('falls back to slicing the whole book when the chapter query throws', () => {
    const pk = stub(() => {
      throw new Error('proskomma: table across chapter break')
    })
    const doc = pkfChapterSofria(pk, 'x_Y', 'MAT', 2)
    expect(doc.fallback).toBe('whole-book')
    expect(doc.sequence.blocks).toHaveLength(2) // heading + chapter-2 paragraph
    expect(JSON.stringify(doc)).not.toContain('"one"')
  })

  it('falls back when the chapter query comes back empty', () => {
    const doc = pkfChapterSofria(stub(() => null), 'x_Y', 'MAT', 1)
    expect(doc.fallback).toBe('whole-book')
    expect(JSON.stringify(doc)).toContain('"one"')
  })

  it('throws when the chapter is not in the book either', () => {
    expect(() => pkfChapterSofria(stub(() => null), 'x_Y', 'MAT', 9)).toThrow(/No sofria/)
  })

  it('rejects malformed references before querying', () => {
    const pk = stub(() => null)
    expect(() => pkfChapterSofria(pk, 'x_Y', 'mat"}', 1)).toThrow(/bad reference/)
    expect(pk.gqlQuerySync).not.toHaveBeenCalled()
  })
})

describe('pkfRenderOptions', () => {
  it('maps SAB app-config features to renderer options', () => {
    const o = pkfRenderOptions({
      collection: { textDirection: 'rtl' },
      features: { 'show-red-letters': true, 'hide-verse-number-1': true, 'chapter-number-format': 'top' },
    })
    expect(o).toMatchObject({ direction: 'rtl', wordsOfJesus: true, hideVerseNumberOne: true, chapterNumber: 'top' })
  })

  it('is empty without an app-config', () => {
    expect(pkfRenderOptions(null)).toEqual({})
  })
})
