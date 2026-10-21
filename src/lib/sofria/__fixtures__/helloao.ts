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

/** Louis Segond 1910 (public domain), 3 John 1 — the chapter compact-alignments'
 *  README gives a reference text fingerprint for (fra_lsg). */
export const LSG_3JN_1: HelloaoChapterJson = {
  "chapter": {
    "number": 1,
    "content": [
      {
        "type": "heading",
        "content": [
          "Adresse et salutation. Éloge de Gaïus"
        ]
      },
      {
        "type": "verse",
        "number": 1,
        "content": [
          "L’ancien, à Gaïus, le bien-aimé, que j’aime dans la vérité."
        ]
      },
      {
        "type": "verse",
        "number": 2,
        "content": [
          "Bien-aimé, je souhaite que tu prospères à tous égards et sois en bonne santé, comme prospère l’état de ton âme."
        ]
      },
      {
        "type": "verse",
        "number": 3,
        "content": [
          "J’ai été fort réjoui, lorsque des frères sont arrivés et ont rendu témoignage de la vérité qui est en toi, de la manière dont tu marches dans la vérité."
        ]
      },
      {
        "type": "verse",
        "number": 4,
        "content": [
          "Je n’ai pas de plus grande joie que d’apprendre que mes enfants marchent dans la vérité."
        ]
      },
      {
        "type": "verse",
        "number": 5,
        "content": [
          "Bien-aimé, tu agis fidèlement dans ce que tu fais pour les frères, et même pour des frères étrangers,"
        ]
      },
      {
        "type": "verse",
        "number": 6,
        "content": [
          "lesquels ont rendu témoignage de ta charité, en présence de l’Église. Tu feras bien de pourvoir à leur voyage d’une manière digne de Dieu."
        ]
      },
      {
        "type": "verse",
        "number": 7,
        "content": [
          "Car c’est pour le nom de Jésus-Christ qu’ils sont partis, sans rien recevoir des païens."
        ]
      },
      {
        "type": "verse",
        "number": 8,
        "content": [
          "Nous devons donc accueillir de tels hommes, afin d’être ouvriers avec eux pour la vérité."
        ]
      },
      {
        "type": "heading",
        "content": [
          "Plainte contre Diotrèphe"
        ]
      },
      {
        "type": "verse",
        "number": 9,
        "content": [
          "J’ai écrit quelques mots à l’Église; mais Diotrèphe, qui aime à être le premier parmi eux, ne nous reçoit point."
        ]
      },
      {
        "type": "verse",
        "number": 10,
        "content": [
          "C’est pourquoi, si je vais vous voir, je rappellerai les actes qu’il commet, en tenant contre nous de méchants propos; non content de cela, il ne reçoit pas les frères, et ceux qui voudraient le faire, il les en empêche et les chasse de l’Église."
        ]
      },
      {
        "type": "verse",
        "number": 11,
        "content": [
          "Bien-aimé, n’imite pas le mal, mais le bien. Celui qui fait le bien est de Dieu; celui qui fait le mal n’a point vu Dieu."
        ]
      },
      {
        "type": "heading",
        "content": [
          "Éloge de Démétrius. Salutations"
        ]
      },
      {
        "type": "verse",
        "number": 12,
        "content": [
          "Tous, et la vérité elle-même, rendent un bon témoignage à Démétrius; nous aussi, nous lui rendons témoignage, et tu sais que notre témoignage est vrai."
        ]
      },
      {
        "type": "verse",
        "number": 13,
        "content": [
          "J’aurais beaucoup de choses à t’écrire, mais je ne veux pas le faire avec l’encre et la plume."
        ]
      },
      {
        "type": "verse",
        "number": 14,
        "content": [
          "J’espère te voir bientôt, et nous parlerons de bouche à bouche."
        ]
      },
      {
        "type": "verse",
        "number": 15,
        "content": [
          "Que la paix soit avec toi! Les amis te saluent. Salue les amis, chacun en particulier."
        ]
      }
    ],
    "footnotes": []
  }
}
