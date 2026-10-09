import { afterEach, describe, expect, it, vi } from 'vitest'
import { openbibleEditionsFor, fetchOpenbibleChapter, isNDLicense, type OpenbibleCatalog } from './openbible-text'

// Shape of the live catalog/openbible-editions.json (2026-10-09).
const CATALOG: OpenbibleCatalog = {
  entries: {
    p1: {
      abbr: 'OECV',
      iso: 'ekk',
      published: true,
      books: ['JHN', 'MAT'],
      canon: ['ntp'],
      licenses: [{ type: 'CC BY-SA' }],
      path: 'openbible/ekk/OECV/',
    },
    p2: { abbr: 'KRB', iso: 'ekk', published: false, reason: 'nd_license' },
    p3: { abbr: 'FULL', iso: 'ekk', published: true, books: ['GEN'], canon: ['ot'], licenses: [], path: 'openbible/ekk/FULL/' },
  },
  formats: { sofria: { path: '<BOOK>/<chapter>.sofria.json' } },
}

describe('openbibleEditionsFor', () => {
  it('offers nothing while the allow-list is empty', () => {
    expect(openbibleEditionsFor(CATALOG, 'ekk', 'nt', [])).toEqual([])
  })

  it('matches allow-listed published editions by iso/abbr or project id, partial canons included', () => {
    expect(openbibleEditionsFor(CATALOG, 'ekk', 'nt', ['ekk/OECV'])).toEqual([
      {
        projectId: 'p1',
        abbr: 'OECV',
        path: 'openbible/ekk/OECV/',
        books: ['JHN', 'MAT'],
        licenses: [{ type: 'CC BY-SA' }],
        sofriaPattern: '<BOOK>/<chapter>.sofria.json',
      },
    ])
    expect(openbibleEditionsFor(CATALOG, 'ekk', 'ot', ['p3']).map((e) => e.abbr)).toEqual(['FULL'])
  })

  it('never offers an unpublished edition, another canon or another language', () => {
    expect(openbibleEditionsFor(CATALOG, 'ekk', 'nt', ['ekk/KRB', 'ekk/FULL'])).toEqual([])
    expect(openbibleEditionsFor(CATALOG, 'xyz', 'nt', ['ekk/OECV'])).toEqual([])
  })
})

describe('fetchOpenbibleChapter', () => {
  afterEach(() => vi.unstubAllGlobals())
  const [edition] = openbibleEditionsFor(CATALOG, 'ekk', 'nt', ['ekk/OECV'])

  it('fetches <path><BOOK>/<chapter>.sofria.json', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ sequence: { type: 'main', blocks: [] } }) })
    vi.stubGlobal('fetch', fetchMock)
    const doc = await fetchOpenbibleChapter(edition, 'JHN', 3)
    expect(doc?.sequence.type).toBe('main')
    expect(fetchMock.mock.calls[0][0]).toMatch(/\/openbible\/ekk\/OECV\/JHN\/3\.sofria\.json$/)
  })

  it('does not fetch a book the edition does not have', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    expect(await fetchOpenbibleChapter(edition, 'GEN', 1)).toBeNull()
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe('isNDLicense', () => {
  it('detects ND among an edition\'s licenses', () => {
    expect(isNDLicense([{ type: 'CC BY-NC-ND' }])).toBe(true)
    expect(isNDLicense([{ type: 'CC BY-SA' }])).toBe(false)
    expect(isNDLicense(undefined)).toBe(false)
  })
})
