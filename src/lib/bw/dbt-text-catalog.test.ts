import { describe, expect, it, vi, beforeEach } from 'vitest'

// Trimmed but verbatim slice of the live https://cdn.bibel.wiki/catalog/text.json
// (confirmed live 2026-09) — real shapes, not contrived: mixed "t:"/"T:" id
// encodings, single- and multi-format variant lists, and both json-having
// (spa, ahr, ind) and json-less (nor, fra) editions among languages this
// app actually resolves to via text-edition.ts. SPABDA is the specific,
// confirmed-live case where DBT's real fileset prefix ("SPNBDA") does NOT
// match this app's own resolved base id ("SPABDA", from media.json's own
// "t" field) — guessing a fileset id from our own base id would 404 for
// this exact edition; only the catalog's literal "T:SPNBDAN..." ids work.
const FIXTURE = {
    entries: {
        'spa:nt': {
            SPABDA: [
                { id: 'T:SPNBDA', fmt: ['f'] },
                { id: 'T:SPNBDAN_ET', fmt: ['pl'] },
                { id: 'T:SPNBDAN_ET-json', fmt: ['j'] },
                { id: 'T:SPNBDAN_ET-usx', fmt: ['u'] },
            ],
            SPNLBV: [{ id: 't:', fmt: ['pl'] }],
        },
        'spa:ot': {
            SPABDA: [
                { id: 'T:SPNBDAO_ET', fmt: ['pl'] },
                { id: 'T:SPNBDAO_ET-json', fmt: ['j'] },
                { id: 'T:SPNBDAO_ET-usx', fmt: ['u'] },
            ],
        },
        'nor:nt': {
            NORNBS: [{ id: 't:', fmt: ['f', 'pl'] }],
            NORNBV: [{ id: 't:', fmt: ['f', 'pl'] }],
        },
        'fra:nt': {
            FRADBY: [{ id: 'T:FRNDBY', fmt: ['pl'] }],
            FRNTLS: [{ id: 't:', fmt: ['f', 'pl'] }],
        },
        'ahr:nt': {
            AHRDPI: [
                { id: 't:N_ET', fmt: ['pl'] },
                { id: 't:N_ET-json', fmt: ['j'] },
                { id: 't:N_ET-usx', fmt: ['u'] },
            ],
        },
        'ind:ot': {
            INDALAO: [
                { id: 't:_ET', fmt: ['pl'] },
                { id: 't:_ET-json', fmt: ['j'] },
                { id: 't:_ET-usx', fmt: ['u'] },
            ],
        },
    },
}

const mockFetch = vi.fn()

beforeEach(() => {
    vi.resetModules()
    mockFetch.mockReset()
    vi.stubGlobal('fetch', mockFetch)
})

async function freshModule() {
    return await import('./dbt-text-catalog')
}

describe('dbtSofriaFilesetId', () => {
    it('decodes an uppercase-literal id whose prefix differs from our own base id (spa)', async () => {
        mockFetch.mockResolvedValue({ ok: true, json: async () => FIXTURE })
        const { dbtSofriaFilesetId } = await freshModule()
        // Our resolver would compute base "SPABDA" + letter "N" -> "SPABDAN" —
        // that string is NOT a catalog key and NOT the real fileset id either.
        expect(await dbtSofriaFilesetId('spa', 'nt', 'SPABDAN')).toBe('SPNBDAN_ET-json')
        expect(await dbtSofriaFilesetId('spa', 'ot', 'SPABDAO')).toBe('SPNBDAO_ET-json')
    })

    it('decodes a lowercase-suffix id built from the distinct id (ahr, ind)', async () => {
        mockFetch.mockResolvedValue({ ok: true, json: async () => FIXTURE })
        const { dbtSofriaFilesetId } = await freshModule()
        expect(await dbtSofriaFilesetId('ahr', 'nt', 'AHRDPIN')).toBe('AHRDPIN_ET-json')
        expect(await dbtSofriaFilesetId('ind', 'ot', 'INDALAO')).toBe('INDALAO_ET-json')
    })

    it('returns null for a canon with no json variant at all (nor, fra)', async () => {
        mockFetch.mockResolvedValue({ ok: true, json: async () => FIXTURE })
        const { dbtSofriaFilesetId } = await freshModule()
        expect(await dbtSofriaFilesetId('nor', 'nt', 'NORNBS')).toBeNull()
        expect(await dbtSofriaFilesetId('fra', 'nt', 'FRNTLSN')).toBeNull()
    })

    it('returns null when our filesetId matches no distinct id under this canon', async () => {
        mockFetch.mockResolvedValue({ ok: true, json: async () => FIXTURE })
        const { dbtSofriaFilesetId } = await freshModule()
        expect(await dbtSofriaFilesetId('spa', 'nt', 'SOMEOTHERN')).toBeNull()
    })

    it('fetches the catalog only once across multiple calls', async () => {
        mockFetch.mockResolvedValue({ ok: true, json: async () => FIXTURE })
        const { dbtSofriaFilesetId } = await freshModule()
        await dbtSofriaFilesetId('spa', 'nt', 'SPABDAN')
        await dbtSofriaFilesetId('ahr', 'nt', 'AHRDPIN')
        await dbtSofriaFilesetId('nor', 'nt', 'NORNBS')
        expect(mockFetch).toHaveBeenCalledTimes(1)
    })

    it('returns null (never guesses) when the catalog fetch fails', async () => {
        mockFetch.mockResolvedValue({ ok: false })
        const { dbtSofriaFilesetId } = await freshModule()
        expect(await dbtSofriaFilesetId('spa', 'nt', 'SPABDAN')).toBeNull()
    })

    it('returns null (never guesses) when the fetch throws', async () => {
        mockFetch.mockRejectedValue(new Error('network down'))
        const { dbtSofriaFilesetId } = await freshModule()
        expect(await dbtSofriaFilesetId('spa', 'nt', 'SPABDAN')).toBeNull()
    })
})
