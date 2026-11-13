import { afterEach, describe, expect, it, vi } from 'vitest'
import { editionFolder, fetchPublishedChapter, isNDLicense, publishedChapterPath } from './published-text'

describe('publishedChapterPath', () => {
  it('puts the _meta.json chapter pattern under the edition folder', () => {
    expect(editionFolder('/door43/spa/es-419_glt')).toBe('door43/spa/es-419_glt/')
    expect(publishedChapterPath('crosswire/hye/ArmEastern/', { formats: { sofria: { path: '<BOOK>/<chapter>.sofria.json' } } }, 'JHN', 3))
      .toBe('crosswire/hye/ArmEastern/JHN/3.sofria.json')
    expect(publishedChapterPath('ebible/eng/x/', {}, 'GEN', 1)).toBe('ebible/eng/x/GEN/1.sofria.json')
  })
})

describe('fetchPublishedChapter', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('reads _meta.json once, then fetches only books it lists', async () => {
    const fetchMock = vi.fn(async (url: string) => ({
      ok: true,
      json: async () => (url.endsWith('_meta.json')
        ? { books: ['TIT'], formats: { sofria: { path: '<BOOK>/<chapter>.sofria.json' } } }
        : { sequence: { type: 'main', blocks: [] } }),
    }))
    vi.stubGlobal('fetch', fetchMock)
    expect((await fetchPublishedChapter('door43/spa/es-419_glt/', 'TIT', 1))?.sequence.type).toBe('main')
    expect(await fetchPublishedChapter('door43/spa/es-419_glt/', 'JHN', 1)).toBeNull()
    const urls = fetchMock.mock.calls.map((c) => c[0])
    expect(urls.filter((u) => u.endsWith('_meta.json'))).toHaveLength(1)
    expect(urls.some((u) => /door43\/spa\/es-419_glt\/TIT\/1\.sofria\.json$/.test(u))).toBe(true)
    expect(urls.some((u) => u.includes('/JHN/'))).toBe(false)
  })
})

describe('isNDLicense', () => {
  it("detects ND among an edition's licenses", () => {
    expect(isNDLicense([{ type: 'CC BY-NC-ND' }])).toBe(true)
    expect(isNDLicense([{ type: 'CC BY-SA' }])).toBe(false)
    expect(isNDLicense(undefined)).toBe(false)
  })
})
