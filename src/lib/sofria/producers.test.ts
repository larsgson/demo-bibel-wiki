import { describe, expect, it } from 'vitest'
import { chapterVerses, renderChapterHtml, type SofriaDoc } from './index'
import { helloaoToSofria, flatVersesToSofria } from './convert'
import { paragraph, versesWrapper, headingGraft, footnoteGraft } from './__fixtures__/build'
import { PSA_3, MAT_1, JHN_3_HEAD } from './__fixtures__/helloao'

// Producer → Sofria → the vendored extractor/renderer, on real helloAO data
// and the shapes the old in-app emulator/extractor were tested on. Text is
// compared exactly; HTML only structurally.

const T = { lang: 'eng', abbr: 'BSB' }
const text = (doc: SofriaDoc, label: string) => chapterVerses(doc).find((v) => v.label === label)?.text
const count = (html: string, re: RegExp) => (html.match(re) ?? []).length

describe('helloAO (PSA 3 — heading, superscription, poetry, footnote)', () => {
  const doc = helloaoToSofria(PSA_3, 'PSA', T)
  const r = renderChapterHtml(doc)

  it('extracts verse text, a plain string after poetry ("Selah") spaced', () => {
    expect(text(doc, '1')).toBe('O LORD, how my foes have increased! How many rise up against me!')
    expect(text(doc, '2')).toBe('Many say of me, “God will not deliver him.” Selah')
    expect(text(doc, '3')).toBe('But You, O LORD, are a shield around me, my glory, and the One who lifts my head.')
  })

  it('never leaks footnote, heading or superscription text into verses', () => {
    const all = chapterVerses(doc).map((v) => v.text).join(' ')
    expect(all).not.toContain('Selah or Interlude')
    expect(all).not.toContain('Deliver Me')
    expect(all).not.toContain('A Psalm of David')
  })

  it('renders heading, superscription and poetry levels, one caller per note', () => {
    expect(r.html).toContain('<div class="s">')
    expect(r.html).toContain('<div class="d">')
    expect(r.html).toContain('<div class="q">')
    expect(r.html).toContain('<div class="q2">')
    expect(r.notes).toHaveLength(1)
    expect(r.notes[0].html).toContain('Selah or Interlude')
    expect(count(r.html, /class="footnote-caller"/g)).toBe(1)
    expect(r.warnings).toEqual([])
  })

  it('prints each verse number once even when the verse spans two lines', () => {
    expect(count(r.html, /<span class="v">2<\/span>/g)).toBe(1)
  })
})

describe('helloAO (MAT 1 — prose + poetry mix)', () => {
  const doc = helloaoToSofria(MAT_1, 'MAT', T)

  it('extracts prose, poetry and lineBreak-split verses', () => {
    expect(text(doc, '1')).toBe(
      'This is the record of the genealogy of Jesus Christ, the son of David, the son of Abraham:',
    )
    expect(text(doc, '11')).toBe('and Josiah the father of Jeconiah and his brothers at the time of the exile to Babylon.')
    expect(text(doc, '12')).toBe(
      'After the exile to Babylon: Jeconiah was the father of Shealtiel, Shealtiel the father of Zerubbabel,',
    )
  })
})

describe('helloAO (JHN 3 — top-level line_break, quote after a note)', () => {
  const doc = helloaoToSofria(JHN_3_HEAD, 'JHN', T)

  it('attaches a closing quote directly after a footnote', () => {
    expect(text(doc, '3')).toBe(
      'Jesus replied, “Truly, truly, I tell you, no one can see the kingdom of God unless he is born again.”',
    )
  })

  it('starts a new paragraph at the line_break: verses 1–2, then 3', () => {
    const html = renderChapterHtml(doc).html
    const paras = html.split(/<div class="(?:p|m)"/).slice(1)
    expect(paras).toHaveLength(2)
    expect(paras[0]).toContain('data-verse="2"')
    expect(paras[0]).not.toContain('data-verse="3"')
    expect(paras[1]).toContain('data-verse="3"')
  })
})

describe('helloAO — edge cases', () => {
  it('spaces bare strings around footnotes in narrative prose (GEN 1)', () => {
    const doc = helloaoToSofria(
      {
        chapter: {
          number: 1,
          content: [
            { type: 'verse', number: 1, content: ['I begynnelsen', { noteId: 0 }, 'skapade Gud himmel', { noteId: 1 }, 'och jord.'] },
            { type: 'verse', number: 6, content: ['And God said, “Let there be an expanse', { noteId: 2 }, 'between the waters.”'] },
          ],
          footnotes: [
            { noteId: 0, caller: '+', text: 'a' },
            { noteId: 1, caller: '+', text: 'b' },
            { noteId: 2, caller: '+', text: 'c' },
          ],
        },
      },
      'GEN',
      T,
    )
    expect(text(doc, '1')).toBe('I begynnelsen skapade Gud himmel och jord.')
    expect(text(doc, '6')).toBe('And God said, “Let there be an expanse between the waters.”')
  })

  it('wraps words of Jesus', () => {
    const doc = helloaoToSofria(
      { chapter: { number: 1, content: [{ type: 'verse', number: 1, content: [{ text: 'Follow Me.', wordsOfJesus: true }] }] } },
      'MAT',
      T,
    )
    expect(renderChapterHtml(doc).html).toContain('<span class="wj">Follow Me.</span>')
    expect(renderChapterHtml(doc, { wordsOfJesus: false }).html).not.toContain('<span class="wj">')
  })
})

describe('flat verses (DBT text_plain)', () => {
  it('round-trips text, trimmed, with range labels kept', () => {
    const doc = flatVersesToSofria('JHN', 1, [
      { label: '1', text: 'a' },
      { label: '2-3', text: '  b  ' },
      { label: '4', text: 'c & <d>' },
    ], T)
    expect(chapterVerses(doc)).toEqual([
      { label: '1', num: 1, text: 'a' },
      { label: '2-3', num: 2, text: 'b' },
      { label: '4', num: 4, text: 'c & <d>' },
    ])
  })

  it('renders one paragraph, escaped, one phrase per verse', () => {
    const html = renderChapterHtml(flatVersesToSofria('JHN', 1, [{ label: '1', text: 'a & <b>' }], T)).html
    expect(count(html, /class="txs seltxt scroll-item"/g)).toBe(1)
    expect(html).toContain('a &amp; &lt;b&gt;')
  })

  it('gives no verses for empty input', () => {
    expect(chapterVerses(flatVersesToSofria('JHN', 1, [], T))).toEqual([])
  })
})

// Cases the old in-app extractor (sofriaVerses.ts) was tested on, now
// through the vendored extractor. Where behaviour changed on purpose, the
// test says so.
describe('extraction rules (vendored verses.js)', () => {
  const doc = (blocks: SofriaDoc['sequence']['blocks']): SofriaDoc => ({ sequence: { type: 'main', blocks } })

  it('merges a verse split across two paragraphs', () => {
    const d = doc([
      paragraph('p', [versesWrapper(1, ['first half'], true)]),
      paragraph('p', [versesWrapper(1, ['second half'], false)]),
    ])
    expect(chapterVerses(d)).toEqual([{ label: '1', num: 1, text: 'first half second half' }])
  })

  it('skips heading grafts and footnotes', () => {
    const d = doc([headingGraft('A Heading'), paragraph('p', [versesWrapper(1, ['before ', footnoteGraft('+', 'note'), 'after'], true)])])
    expect(chapterVerses(d)).toEqual([{ label: '1', num: 1, text: 'before after' }])
  })

  it('keeps text inside a usfm:wj wrapper', () => {
    const d = doc([paragraph('p', [versesWrapper(1, [{ type: 'wrapper', subtype: 'usfm:wj', content: ['Follow Me.'] }], true)])])
    expect(chapterVerses(d)).toEqual([{ label: '1', num: 1, text: 'Follow Me.' }])
  })

  it('splits on bare verses_label marks with no wrapper', () => {
    const d = doc([
      paragraph('p', [
        { type: 'mark', subtype: 'verses_label', atts: { number: '1' } },
        'a',
        { type: 'mark', subtype: 'verses_label', atts: { number: '2' } },
        'b',
      ]),
    ])
    expect(chapterVerses(d).map((v) => [v.label, v.text])).toEqual([['1', 'a'], ['2', 'b']])
  })

  it('a \\d paragraph before verse 1 is a heading, not verse text', () => {
    const d = doc([paragraph('d', ['A Psalm of David.']), paragraph('q1', [versesWrapper(1, ['O LORD'], true)])])
    expect(chapterVerses(d)).toEqual([{ label: '1', num: 1, text: 'O LORD' }])
  })

  it('CHANGED: "\\d \\v 1 …" — text after the verse number inside \\d is verse 1 (was dropped as heading)', () => {
    const d = doc([paragraph('d', [versesWrapper(1, ['(Of David.)'], true)]), paragraph('q1', [versesWrapper(1, ['O LORD'], false)])])
    expect(text(d, '1')).toBe('(Of David.) O LORD')
  })
})
