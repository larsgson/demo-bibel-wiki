import { describe, expect, it, vi, beforeEach } from 'vitest'

const mockFetchDbtUsx = vi.fn()
const mockDbtUsxFilesetId = vi.fn()

vi.mock('./content-sources', () => ({
    fetchDbtUsx: (...args: unknown[]) => mockFetchDbtUsx(...args),
}))
vi.mock('./dbt-text-catalog', () => ({
    dbtUsxFilesetId: (...args: unknown[]) => mockDbtUsxFilesetId(...args),
}))

const { loadDbtUsxSofria } = await import('./dbt-usx')

// Minimal, synthetic (non-scripture) USX 3.0 — real shape, placeholder
// text, matching this session's "no copyrighted fixtures" rule. Exercises
// the REAL proskomma-core import path (not mocked) — that's the whole
// point of this module, confirmed live against real DBT USX (Ahanta,
// Gerai, Keliko) in-session before this was written.
function usxBook(bookCode: string, verse1Text: string): string {
    return `<?xml version="1.0" encoding="utf-8"?>
<usx version="3.0">
  <book code="${bookCode}" style="id" />
  <para style="mt">Test Book</para>
  <chapter number="1" style="c" sid="${bookCode} 1" />
  <para style="p">
    <verse number="1" style="v" sid="${bookCode} 1:1" />${verse1Text}<verse eid="${bookCode} 1:1" />
    <verse number="2" style="v" sid="${bookCode} 1:2" />Second placeholder verse.<verse eid="${bookCode} 1:2" />
  </para>
  <chapter eid="${bookCode} 1" />
</usx>`
}

beforeEach(() => {
    vi.clearAllMocks()
})

describe('loadDbtUsxSofria', () => {
    it('returns null (never guesses) when the catalog has no usx variant for this edition', async () => {
        mockDbtUsxFilesetId.mockResolvedValue(null)
        const result = await loadDbtUsxSofria('xua', 'nt', 'SOMEID', 'MAT', 1)
        expect(result).toBeNull()
        expect(mockFetchDbtUsx).not.toHaveBeenCalled()
    })

    it('imports real USX via Proskomma and returns a matching Sofria sequence', async () => {
        mockDbtUsxFilesetId.mockResolvedValue('SOMEIDN_ET-usx')
        mockFetchDbtUsx.mockResolvedValue(usxBook('MAT', 'First placeholder verse.'))

        const seq = await loadDbtUsxSofria('xub', 'nt', 'SOMEID', 'MAT', 1)
        expect(seq).not.toBeNull()
        expect(seq!.type).toBe('main')
        expect(JSON.stringify(seq)).toContain('First placeholder verse.')
        expect(JSON.stringify(seq)).toContain('Second placeholder verse.')
        expect(mockFetchDbtUsx).toHaveBeenCalledWith('SOMEIDN_ET-usx', 'MAT')
    })

    it('fetches and imports a book only once, reusing it for a second chapter query', async () => {
        mockDbtUsxFilesetId.mockResolvedValue('ONCEID_ET-usx')
        mockFetchDbtUsx.mockResolvedValue(usxBook('MRK', 'Only verse.'))

        const first = await loadDbtUsxSofria('xuc', 'nt', 'ONCEID', 'MRK', 1)
        const second = await loadDbtUsxSofria('xuc', 'nt', 'ONCEID', 'MRK', 1)
        expect(first).not.toBeNull()
        expect(second).not.toBeNull()
        expect(mockFetchDbtUsx).toHaveBeenCalledTimes(1)
    })

    it('sanitizes a fileset id containing "_" into a Proskomma-valid selector (would otherwise throw)', async () => {
        // Real DBT usx ids look like "AHABLGN_ET-usx" — SABProskomma's abbr
        // selector rejects "_" outright; confirmed live in-session. This
        // just needs to not throw.
        mockDbtUsxFilesetId.mockResolvedValue('AHABLGN_ET-usx')
        mockFetchDbtUsx.mockResolvedValue(usxBook('LUK', 'Underscore id test.'))

        const seq = await loadDbtUsxSofria('xud', 'nt', 'AHABLGN', 'LUK', 1)
        expect(seq).not.toBeNull()
    })

    it('returns null when the USX fetch itself fails', async () => {
        mockDbtUsxFilesetId.mockResolvedValue('FAILID_ET-usx')
        mockFetchDbtUsx.mockResolvedValue(null)
        const result = await loadDbtUsxSofria('xue', 'nt', 'FAILID', 'MAT', 1)
        expect(result).toBeNull()
    })

    it('returns null for a chapter that does not exist in the imported book', async () => {
        mockDbtUsxFilesetId.mockResolvedValue('CHID_ET-usx')
        mockFetchDbtUsx.mockResolvedValue(usxBook('JHN', 'Only chapter 1.'))

        const result = await loadDbtUsxSofria('xuf', 'nt', 'CHID', 'JHN', 99)
        expect(result).toBeNull()
    })
})
