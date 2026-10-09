import type { SofriaDoc } from '../types'

/** A small chapter in the shape proskomma-core's `sofria(chapter: 1)`
 *  returns: heading graft, a prose paragraph with a footnote and a range
 *  verse, then a poetry paragraph. */
export const CHAPTER: SofriaDoc = {
  sequence: {
    type: 'main',
    blocks: [
      {
        type: 'graft',
        sequence: { type: 'heading', blocks: [{ type: 'paragraph', subtype: 'usfm:s1', content: ['The Beginning'] }] },
      },
      {
        type: 'paragraph',
        subtype: 'usfm:p',
        content: [
          {
            type: 'wrapper',
            subtype: 'chapter',
            atts: { number: '1' },
            content: [
              { type: 'mark', subtype: 'chapter_label', atts: { number: '1' } },
              {
                type: 'wrapper',
                subtype: 'verses',
                atts: { number: '1' },
                content: [
                  { type: 'mark', subtype: 'verses_label', atts: { number: '1' } },
                  'In the beginning',
                  {
                    type: 'graft',
                    subtype: 'footnote',
                    sequence: {
                      type: 'footnote',
                      blocks: [
                        {
                          type: 'paragraph',
                          subtype: 'usfm:f',
                          content: [
                            { type: 'graft', subtype: 'note_caller', sequence: { type: 'note_caller', blocks: [{ type: 'paragraph', content: ['+'] }] } },
                            'Or: at first.',
                          ],
                        },
                      ],
                    },
                  },
                  ' God created.',
                ],
              },
              {
                type: 'wrapper',
                subtype: 'verses',
                atts: { number: '2-3' },
                content: [{ type: 'mark', subtype: 'verses_label', atts: { number: '2-3' } }, 'Then more happened.'],
              },
            ],
          },
        ],
      },
      {
        type: 'paragraph',
        subtype: 'usfm:q1',
        content: [
          {
            type: 'wrapper',
            subtype: 'chapter',
            atts: { number: '1' },
            content: [
              {
                type: 'wrapper',
                subtype: 'verses',
                atts: { number: '4' },
                content: [{ type: 'mark', subtype: 'verses_label', atts: { number: '4' } }, 'A line of poetry.'],
              },
            ],
          },
        ],
      },
    ],
  },
}
