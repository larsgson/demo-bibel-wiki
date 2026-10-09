import { describe, expect, it } from 'vitest'
import { excerptSofriaDoc } from './excerpt'
import { renderChapterHtml, verseLabelOverlaps, verseLabelIncludes } from './index'
import { paragraph, versesWrapper, headingGraft, footnoteGraft } from './__fixtures__/build'
import type { SofriaDoc } from './types'

// Two headed sections: "Section A" -> verses 1-3 (verse 2 has a footnote),
// "Section B" -> verses 4-6.
function twoSectionDoc(): SofriaDoc {
  return {
    sequence: {
      type: 'main',
      blocks: [
        { type: 'graft', sequence: { type: 'title', blocks: [paragraph('mt1', ['Book Title'])] } },
        headingGraft('Section A'),
        paragraph('p', [
          { type: 'mark', subtype: 'chapter_label', atts: { number: '1' } },
          versesWrapper(1, ['one'], true),
          versesWrapper(2, ['two', footnoteGraft('+', 'a note')], true),
          versesWrapper(3, ['three'], true),
        ]),
        headingGraft('Section B'),
        paragraph('p', [versesWrapper(4, ['four'], true), versesWrapper(5, ['five'], true)]),
        paragraph('q1', [versesWrapper(5, ['five, continued'], false), versesWrapper(6, ['six'], true)]),
      ],
    },
  }
}

const range = (from: number, to: number) => (label: string) => verseLabelOverlaps(label, from, to)

/** Verse labels of the rendered phrases, in order, without repeats. */
function verses(doc: SofriaDoc): string[] {
  const html = renderChapterHtml(doc, { chapterNumber: 'none' }).html
  return [...new Set([...html.matchAll(/data-verse="([^"]+)"/g)].map((m) => m[1]))]
}
const html = (doc: SofriaDoc) => renderChapterHtml(doc, { chapterNumber: 'none' }).html

describe('excerptSofriaDoc', () => {
  it('keeps only in-range verses and the heading right before them; never the title', () => {
    const ex = excerptSofriaDoc(twoSectionDoc(), range(1, 2))
    expect(verses(ex)).toEqual(['1', '2'])
    expect(html(ex)).toContain('Section A')
    expect(html(ex)).not.toContain('Section B')
    expect(html(ex)).not.toContain('Book Title')
    expect(html(ex)).not.toContain('three')
  })

  it('drops a heading whose passage is outside the excerpt', () => {
    const ex = excerptSofriaDoc(twoSectionDoc(), range(4, 6))
    expect(verses(ex)).toEqual(['4', '5', '6'])
    expect(html(ex)).not.toContain('Section A')
    expect(html(ex)).toContain('Section B')
  })

  it('keeps a mid-excerpt heading when the range spans both sections', () => {
    const ex = excerptSofriaDoc(twoSectionDoc(), range(2, 5))
    expect(verses(ex)).toEqual(['2', '3', '4', '5'])
    expect(html(ex)).toContain('Section A')
    expect(html(ex)).toContain('Section B')
  })

  it('keeps a verse continued in a later paragraph', () => {
    const ex = excerptSofriaDoc(twoSectionDoc(), range(5, 5))
    expect(html(ex)).toContain('five, continued')
    expect(html(ex)).not.toContain('six')
  })

  it('keeps an inline footnote on a kept verse, and drops the chapter number', () => {
    const ex = excerptSofriaDoc(twoSectionDoc(), range(2, 2))
    expect(renderChapterHtml(ex).notes).toHaveLength(1)
    expect(JSON.stringify(ex)).not.toContain('chapter_label')
  })

  it('returns no blocks when nothing is in range', () => {
    expect(excerptSofriaDoc(twoSectionDoc(), range(100, 200)).sequence.blocks).toEqual([])
  })

  it('takes a discrete verse list', () => {
    const wanted = [1, 4, 6]
    const ex = excerptSofriaDoc(twoSectionDoc(), (l) => wanted.some((n) => verseLabelIncludes(l, n)))
    expect(verses(ex)).toEqual(['1', '4', '6'])
  })

  it('works on verse marks alone (no verses wrappers), range labels included', () => {
    const mark = (n: string) => ({ type: 'mark' as const, subtype: 'verses_label', atts: { number: n } })
    const doc: SofriaDoc = {
      sequence: { type: 'main', blocks: [paragraph('p', [mark('1'), 'one ', mark('2-3'), 'two-three ', mark('4'), 'four'])] },
    }
    const ex = excerptSofriaDoc(doc, range(3, 3))
    expect(verses(ex)).toEqual(['2-3'])
    expect(html(ex)).not.toContain('one')
    expect(html(ex)).not.toContain('four')
  })

  it('unwraps a chapter wrapper and drops it when empty', () => {
    const doc: SofriaDoc = {
      sequence: {
        type: 'main',
        blocks: [
          paragraph('p', [
            {
              type: 'wrapper',
              subtype: 'chapter',
              atts: { number: '1' },
              content: [versesWrapper(1, ['one'], true), versesWrapper(2, ['two'], true)],
            },
          ]),
        ],
      },
    }
    expect(verses(excerptSofriaDoc(doc, range(1, 1)))).toEqual(['1'])
    expect(excerptSofriaDoc(doc, range(9, 9)).sequence.blocks).toEqual([])
  })
})
