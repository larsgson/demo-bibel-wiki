import { describe, expect, it, vi, beforeEach } from 'vitest'

const mockResolveTextEditions = vi.fn()
const mockFetchHelloaoChapter = vi.fn()
const mockFetchDbtText = vi.fn()
const mockFetchDbtSofria = vi.fn()
const mockDbtSofriaFilesetId = vi.fn()
const mockFetchOpenbibleChapter = vi.fn()
const mockLoadPkfCatalog = vi.fn()
const mockIsLoaded = vi.fn()
const mockLoadDocSet = vi.fn()
const mockFetchSofria = vi.fn()

vi.mock('./text-edition', () => ({
    resolveTextEditions: (...args: unknown[]) => mockResolveTextEditions(...args),
}))
vi.mock('./content-sources', () => ({
    fetchHelloaoChapter: (...args: unknown[]) => mockFetchHelloaoChapter(...args),
    fetchDbtText: (...args: unknown[]) => mockFetchDbtText(...args),
    fetchDbtSofria: (...args: unknown[]) => mockFetchDbtSofria(...args),
}))
vi.mock('./dbt-text-catalog', () => ({
    dbtSofriaFilesetId: (...args: unknown[]) => mockDbtSofriaFilesetId(...args),
}))
vi.mock('./openbible-text', () => ({
    fetchOpenbibleChapter: (...args: unknown[]) => mockFetchOpenbibleChapter(...args),
}))
vi.mock('./pkf-info', () => ({
    loadPkfCatalog: (...args: unknown[]) => mockLoadPkfCatalog(...args),
}))
vi.mock('../reader/store', () => ({
    isLoaded: (...args: unknown[]) => mockIsLoaded(...args),
    loadDocSet: (...args: unknown[]) => mockLoadDocSet(...args),
}))
vi.mock('../reader/sofria', async () => {
    const actual = await vi.importActual<typeof import('../reader/sofria')>('../reader/sofria')
    return { ...actual, fetchSofria: (...args: unknown[]) => mockFetchSofria(...args) }
})

const { loadChapterDoc, loadChapterVerses, getChapterSource } = await import('./chapter-doc')

function helloaoEdition(id: string, canon: 'nt' | 'ot' = 'nt') {
    return { provider: 'helloao' as const, id, canon, via: 'test' }
}
function dbtEdition(id: string, canon: 'nt' | 'ot' = 'nt') {
    return { provider: 'dbt' as const, id, canon, via: 'test' }
}
function pkfEdition(id: string, canon: 'nt' | 'ot' = 'nt') {
    return {
        provider: 'pkf' as const,
        id,
        canon,
        via: 'test',
        pkf: { docSetId: id, pkfUrl: `https://x/${id}.pkf`, catalogUrl: null, styleUrl: '', figureUrls: {}, media: {} },
    }
}

beforeEach(() => {
    vi.clearAllMocks()
    // Default: the catalog has no json fileset id for this edition, so the
    // dbt case never even calls fetchDbtSofria — existing tests exercise
    // the flat-text (fetchDbtText) fallback path unless a test overrides
    // one or both of these.
    mockDbtSofriaFilesetId.mockResolvedValue(null)
    mockFetchDbtSofria.mockResolvedValue(null)
})

describe('loadChapterDoc — fallthrough', () => {
    it('falls through to the second candidate when the first resolves to nothing', async () => {
        mockResolveTextEditions.mockResolvedValue([helloaoEdition('BAD'), dbtEdition('GOOD')])
        mockFetchHelloaoChapter.mockResolvedValue(null)
        mockFetchDbtText.mockResolvedValue([{ num: 1, text: 'hi' }])

        const res = await loadChapterDoc('xx1', 'JHN', 1)
        expect(res?.source).toEqual({ provider: 'dbt', id: 'GOOD' })
        expect(mockFetchHelloaoChapter).toHaveBeenCalledTimes(1)
        expect(mockFetchDbtText).toHaveBeenCalledTimes(1)
    })

    it('returns null when every candidate fails', async () => {
        mockResolveTextEditions.mockResolvedValue([helloaoEdition('BAD')])
        mockFetchHelloaoChapter.mockResolvedValue(null)
        const res = await loadChapterDoc('xx2', 'JHN', 1)
        expect(res).toBeNull()
    })

    it('returns null immediately when there are no candidates at all', async () => {
        mockResolveTextEditions.mockResolvedValue([])
        const res = await loadChapterDoc('xx3', 'JHN', 1)
        expect(res).toBeNull()
        expect(mockFetchHelloaoChapter).not.toHaveBeenCalled()
    })
})

describe('loadChapterDoc — caching', () => {
    it('only calls the winning fetcher once across two calls for the same (iso, book, chapter)', async () => {
        mockResolveTextEditions.mockResolvedValue([dbtEdition('ONE')])
        mockFetchDbtText.mockResolvedValue([{ num: 1, text: 'x' }])

        const first = await loadChapterDoc('xx4', 'GEN', 1)
        const second = await loadChapterDoc('xx4', 'GEN', 1)
        expect(first?.source.id).toBe('ONE')
        expect(second?.source.id).toBe('ONE')
        expect(mockFetchDbtText).toHaveBeenCalledTimes(1)
    })

    it('does not share a cache entry across different isos with the same edition id', async () => {
        mockResolveTextEditions.mockResolvedValue([dbtEdition('SHARED')])
        mockFetchDbtText.mockResolvedValue([{ num: 1, text: 'x' }])
        await loadChapterDoc('xx5', 'GEN', 1)
        await loadChapterDoc('xx6', 'GEN', 1)
        expect(mockFetchDbtText).toHaveBeenCalledTimes(2)
    })
})

describe('loadChapterDoc — DBT native Sofria', () => {
    it('prefers DBT native Sofria structure, fetched by the catalog-given exact id', async () => {
        mockResolveTextEditions.mockResolvedValue([dbtEdition('RICH')])
        mockDbtSofriaFilesetId.mockResolvedValue('RICHREAL_ET-json')
        mockFetchDbtSofria.mockResolvedValue({ type: 'main', blocks: [] })

        const res = await loadChapterDoc('xxD1', 'JHN', 1)
        expect(res?.doc).toEqual({ sequence: { type: 'main', blocks: [] } })
        expect(mockDbtSofriaFilesetId).toHaveBeenCalledWith('xxD1', 'nt', 'RICH')
        expect(mockFetchDbtSofria).toHaveBeenCalledWith('RICHREAL_ET-json', 'JHN', 1)
        expect(mockFetchDbtText).not.toHaveBeenCalled()
    })

    it('falls back to flat text_plain when the catalog has no json id for this edition', async () => {
        mockResolveTextEditions.mockResolvedValue([dbtEdition('FLAT')])
        mockDbtSofriaFilesetId.mockResolvedValue(null)
        mockFetchDbtText.mockResolvedValue([{ num: 1, text: 'plain text' }])

        const res = await loadChapterDoc('xxD2', 'JHN', 1)
        expect(res?.source).toEqual({ provider: 'dbt', id: 'FLAT' })
        expect(mockFetchDbtSofria).not.toHaveBeenCalled()
        expect(mockFetchDbtText).toHaveBeenCalledTimes(1)
    })

    it('never guesses a fileset id — fetchDbtSofria is only ever called with the catalog-decoded id, not edition.id', async () => {
        mockResolveTextEditions.mockResolvedValue([dbtEdition('SPABDAN')])
        // Simulates the real Spanish case: our own resolved id ("SPABDAN")
        // does not share DBT's real fileset prefix at all.
        mockDbtSofriaFilesetId.mockResolvedValue('SPNBDAN_ET-json')
        mockFetchDbtSofria.mockResolvedValue({ type: 'main', blocks: [] })

        await loadChapterDoc('xxD4', 'JHN', 1)
        expect(mockFetchDbtSofria).toHaveBeenCalledWith('SPNBDAN_ET-json', 'JHN', 1)
        expect(mockFetchDbtSofria).not.toHaveBeenCalledWith('SPABDAN', expect.anything(), expect.anything())
    })
})

describe('loadChapterDoc — PKF catalog gate', () => {
    it('never loads the docSet binary when the PKF catalog does not cover the book', async () => {
        mockResolveTextEditions.mockResolvedValue([pkfEdition('lang_C01', 'ot')])
        mockLoadPkfCatalog.mockResolvedValue({ id: 'x', selectors: { lang: 'x', abbr: 'x' }, documents: [{ id: 'JHN', bookCode: 'JHN', h: null, toc: null, toc2: null, toc3: null }] })

        const res = await loadChapterDoc('xx7', 'GEN', 1)
        expect(res).toBeNull()
        expect(mockLoadDocSet).not.toHaveBeenCalled()
        expect(mockFetchSofria).not.toHaveBeenCalled()
    })

    it('loads the docSet and queries sofria when the catalog does cover the book', async () => {
        mockResolveTextEditions.mockResolvedValue([pkfEdition('lang_C02', 'nt')])
        mockLoadPkfCatalog.mockResolvedValue({ id: 'x', selectors: { lang: 'x', abbr: 'x' }, documents: [{ id: 'JHN', bookCode: 'JHN', h: null, toc: null, toc2: null, toc3: null }] })
        mockIsLoaded.mockReturnValue(false)
        mockLoadDocSet.mockResolvedValue(undefined)
        mockFetchSofria.mockReturnValue({ sequence: { type: 'main', blocks: [] } })

        const res = await loadChapterDoc('xx8', 'JHN', 1)
        expect(res?.source).toEqual({ provider: 'pkf', id: 'lang_C02' })
        expect(mockLoadDocSet).toHaveBeenCalledWith('lang_C02', 'https://x/lang_C02.pkf')
        expect(mockFetchSofria).toHaveBeenCalledWith('lang_C02', 'JHN', 1)
    })

    it('skips loadDocSet when already loaded', async () => {
        mockResolveTextEditions.mockResolvedValue([pkfEdition('lang_C03', 'nt')])
        mockLoadPkfCatalog.mockResolvedValue(null) // no catalog fetched -> treated as "don't know", proceed
        mockIsLoaded.mockReturnValue(true)
        mockFetchSofria.mockReturnValue({ sequence: { type: 'main', blocks: [] } })

        await loadChapterDoc('xx9', 'JHN', 1)
        expect(mockLoadDocSet).not.toHaveBeenCalled()
    })
})

describe('loadChapterVerses + getChapterSource', () => {
    it('extracts plain verses from the resolved doc', async () => {
        mockResolveTextEditions.mockResolvedValue([dbtEdition('E1')])
        mockFetchDbtText.mockResolvedValue([{ num: 1, text: 'hello' }])
        const verses = await loadChapterVerses('xxA', 'GEN', 1)
        expect(verses).toEqual([{ num: 1, text: 'hello' }])
    })

    it('records the winning source for getChapterSource', async () => {
        mockResolveTextEditions.mockResolvedValue([helloaoEdition('TID')])
        mockFetchHelloaoChapter.mockResolvedValue({ chapter: { number: 1, content: [{ type: 'verse', number: 1, content: ['x'] }] } })
        await loadChapterDoc('xxB', 'GEN', 1)
        expect(getChapterSource('xxB', 'GEN', 1)).toEqual({ provider: 'helloao', id: 'TID' })
    })

    it('returns null from getChapterSource before any resolution happened', () => {
        expect(getChapterSource('never-called', 'GEN', 1)).toBeNull()
    })
})
