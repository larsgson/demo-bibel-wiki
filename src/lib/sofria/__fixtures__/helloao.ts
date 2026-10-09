import type { HelloaoChapterJson } from '../../bw/content-sources';

// Copied verbatim from live https://bible.helloao.org/api/BSB responses
// (PSA 3, MAT 1, JHN 3), confirmed 2026-09-17. Real shapes, not contrived.

export const PSA_3: HelloaoChapterJson = {
    chapter: {
        number: 3,
        content: [
            { type: 'heading', content: ['Deliver Me, O LORD!'] },
            { type: 'hebrew_subtitle', content: ['A Psalm of David, when he fled from his son Absalom.'] },
            { type: 'line_break' },
            {
                type: 'verse',
                number: 1,
                content: [
                    { text: 'O LORD, how my foes have increased!', poem: 1 },
                    { text: 'How many rise up against me!', poem: 2 },
                ],
            },
            {
                type: 'verse',
                number: 2,
                content: [
                    { text: 'Many say of me,', poem: 1 },
                    { text: '“God will not deliver him.”', poem: 2 },
                    'Selah',
                    { noteId: 5 },
                ],
            },
            {
                type: 'verse',
                number: 3,
                content: [
                    { text: 'But You, O LORD, are a shield around me,', poem: 1 },
                    { text: 'my glory, and the One who lifts my head.', poem: 2 },
                ],
            },
        ],
        footnotes: [
            {
                noteId: 5,
                caller: '+',
                text: 'Selah or Interlude is probably a musical or literary term; here and throughout the Psalms.',
            },
        ],
    },
};

export const MAT_1: HelloaoChapterJson = {
    chapter: {
        number: 1,
        content: [
            {
                type: 'verse',
                number: 1,
                content: ['This is the record of the genealogy of Jesus Christ, the son of David, the son of Abraham:'],
            },
            {
                type: 'verse',
                number: 11,
                content: [
                    { text: 'and Josiah the father of Jeconiah and his brothers', poem: 1 },
                    { text: 'at the time of the exile to Babylon.', poem: 2 },
                ],
            },
            {
                type: 'verse',
                number: 12,
                content: [
                    'After the exile to Babylon:',
                    { lineBreak: true },
                    { text: 'Jeconiah was the father of Shealtiel,', poem: 1 },
                    { lineBreak: true },
                    { text: 'Shealtiel the father of Zerubbabel,', poem: 1 },
                    { lineBreak: true },
                ],
            },
        ],
    },
};

export const JHN_3_HEAD: HelloaoChapterJson = {
    chapter: {
        number: 3,
        content: [
            { type: 'heading', content: ['Jesus and Nicodemus'] },
            {
                type: 'verse',
                number: 1,
                content: ['Now there was a man of the Pharisees named Nicodemus, a leader of the Jews.'],
            },
            {
                type: 'verse',
                number: 2,
                content: [
                    'He came to Jesus at night and said, “Rabbi, we know that You are a teacher who has come from God. For no one could perform the signs You are doing if God were not with him.”',
                ],
            },
            { type: 'line_break' },
            {
                type: 'verse',
                number: 3,
                content: [
                    'Jesus replied, “Truly, truly, I tell you, no one can see the kingdom of God unless he is born again.',
                    { noteId: 13 },
                    '”',
                ],
            },
        ],
        footnotes: [{ noteId: 13, caller: '+', text: 'Or born from above' }],
    },
};
