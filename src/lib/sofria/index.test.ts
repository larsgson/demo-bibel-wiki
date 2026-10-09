import { describe, expect, it } from 'vitest'
import { renderChapterHtml, chapterVerses, injectPlacementVideos } from './index'
import { CHAPTER } from './__fixtures__/chapter'

// Structure checks only — the HTML itself is upstream's to define.
const count = (html: string, re: RegExp) => (html.match(re) ?? []).length

describe('renderChapterHtml', () => {
  const r = renderChapterHtml(CHAPTER)

  it('emits one phrase per verse label, ranges kept as one', () => {
    expect(count(r.html, /data-verse="1"/g)).toBe(1)
    expect(count(r.html, /data-verse="2-3"/g)).toBe(1)
    expect(count(r.html, /data-verse="4"/g)).toBe(1)
    expect(count(r.html, /class="txs seltxt scroll-item"/g)).toBe(3)
  })

  it('keeps headings and poetry paragraphs', () => {
    expect(r.html).toContain('<div class="s">')
    expect(r.html).toContain('<div class="q">')
  })

  it('collects notes, with one caller per note', () => {
    expect(r.notes).toHaveLength(1)
    expect(r.notes[0]).toMatchObject({ kind: 'footnote', verse: '1', html: 'Or: at first.' })
    expect(count(r.html, /class="footnote-caller"[^>]*data-note="X-1"/g)).toBe(1)
  })

  it('renders the fixture without warnings', () => {
    expect(r.warnings).toEqual([])
  })

  it('prefixes generated ids when asked (several chapters on one page)', () => {
    const p = renderChapterHtml(CHAPTER, { idPrefix: 'part2-' })
    expect(p.html).toContain('id="part2-1a"')
    expect(p.notes[0].id).toBe('part2-X-1')
  })
})

describe('renderer options from upstream (a35466b)', () => {
  const withKeyword = {
    sequence: {
      type: 'main',
      blocks: [
        {
          type: 'paragraph' as const,
          subtype: 'usfm:p',
          content: [
            {
              type: 'wrapper' as const,
              subtype: 'verses',
              atts: { number: '1' },
              content: [
                { type: 'mark' as const, subtype: 'verses_label', atts: { number: '1' } },
                'The ',
                { type: 'wrapper' as const, subtype: 'usfm:k', content: ['Sabbath'] },
                ' came.',
              ],
            },
          ],
        },
      ],
    },
  }

  it('keywordLinks turns \\k into a glossary link; off by default', () => {
    expect(renderChapterHtml(withKeyword).html).toContain('<span class="k">Sabbath</span>')
    expect(renderChapterHtml(withKeyword, { keywordLinks: true }).html).toContain(
      '<a class="glossary" match="Sabbath">Sabbath</a>',
    )
  })
})

describe('chapterVerses', () => {
  it('gives labels, integer starts and note-free text in reading order', () => {
    expect(chapterVerses(CHAPTER)).toEqual([
      { label: '1', num: 1, text: 'In the beginning God created.' },
      { label: '2-3', num: 2, text: 'Then more happened.' },
      { label: '4', num: 4, text: 'A line of poetry.' },
    ])
  })
})

describe('injectPlacementVideos', () => {
  const order = (html: string) =>
    [...html.matchAll(/data-video-id="([^"]+)"|data-verse="([^"]+)"|<div class="s">/g)].map(
      (m) => m[1] ?? (m[2] ? `v${m[2]}` : 's'),
    )

  it('puts an "after" video after the paragraph holding its verse (range verses included)', () => {
    const doc = injectPlacementVideos(CHAPTER, [{ id: 'vid', placement: { verse: 3 } }])
    expect(order(renderChapterHtml(doc).html)).toEqual(['s', 'v1', 'v2-3', 'vid', 'v4'])
  })

  it('puts a "before" video ahead of the paragraph its verse opens, below any heading', () => {
    const doc = injectPlacementVideos(CHAPTER, [
      { id: 'first', placement: { verse: 1, pos: 'before' } },
      { id: 'poem', placement: { verse: 4, pos: 'before' } },
    ])
    expect(order(renderChapterHtml(doc).html)).toEqual(['s', 'first', 'v1', 'v2-3', 'poem', 'v4'])
  })

  it('falls back to "after" for a verse in mid-paragraph', () => {
    const doc = injectPlacementVideos(CHAPTER, [{ id: 'mid', placement: { verse: 2, pos: 'before' } }])
    expect(order(renderChapterHtml(doc).html)).toEqual(['s', 'v1', 'v2-3', 'mid', 'v4'])
  })

  it('skips videos without a verse or for a verse not in the chapter, and leaves the input alone', () => {
    const before = JSON.stringify(CHAPTER)
    const doc = injectPlacementVideos(CHAPTER, [
      { id: 'top', placement: { verse: null } },
      { id: 'gone', placement: { verse: 99 } },
    ])
    expect(renderChapterHtml(doc).html).not.toContain('video-block')
    expect(JSON.stringify(CHAPTER)).toBe(before)
  })
})
