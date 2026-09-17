import { describe, expect, it, vi, beforeEach } from 'vitest'

const mockLoadChapterDoc = vi.fn()

vi.mock('./chapter-doc', () => ({
    loadChapterDoc: (...args: unknown[]) => mockLoadChapterDoc(...args),
}))

const { loadReferenceHtml } = await import('./reference-html')

function docWithVerses(...nums: number[]) {
    return {
        doc: {
            sequence: {
                type: 'main',
                blocks: [
                    {
                        type: 'paragraph',
                        subtype: 'usfm:p',
                        content: nums.map((n) => ({
                            type: 'wrapper',
                            subtype: 'verses',
                            atts: { number: String(n) },
                            content: [
                                { type: 'mark', subtype: 'verses_label', atts: { number: String(n) } },
                                `verse ${n}`,
                            ],
                        })),
                    },
                ],
            },
        },
        source: { provider: 'dbt', id: 'X' },
        edition: { provider: 'dbt', id: 'X', canon: 'ot', via: 'test' },
    }
}

beforeEach(() => {
    vi.clearAllMocks()
})

describe('loadReferenceHtml', () => {
    it('renders a single verse-range reference with real verse numbers', async () => {
        mockLoadChapterDoc.mockResolvedValue(docWithVerses(1, 2, 3, 4, 5))
        const html = await loadReferenceHtml('eng', 'GEN 1:2-4')
        expect(mockLoadChapterDoc).toHaveBeenCalledWith('eng', 'GEN', 1)
        expect(html).toContain('data-v="2"')
        expect(html).toContain('data-v="4"')
        expect(html).not.toContain('data-v="1"')
        expect(html).not.toContain('data-v="5"')
    })

    it('concatenates multiple comma-separated ranges in order', async () => {
        mockLoadChapterDoc.mockResolvedValue(docWithVerses(1, 2, 3, 4, 5))
        const html = await loadReferenceHtml('eng', 'GEN 1:1, GEN 1:5')
        expect(html).toContain('data-v="1"')
        expect(html).toContain('data-v="5"')
        expect(html).not.toContain('data-v="2"')
        const firstIdx = html!.indexOf('data-v="1"')
        const secondIdx = html!.indexOf('data-v="5"')
        expect(firstIdx).toBeLessThan(secondIdx)
    })

    it('returns null when no candidate chapter doc resolves', async () => {
        mockLoadChapterDoc.mockResolvedValue(null)
        expect(await loadReferenceHtml('eng', 'GEN 1:1')).toBeNull()
    })

    it('returns null for an unparseable reference', async () => {
        expect(await loadReferenceHtml('eng', 'not a reference')).toBeNull()
        expect(mockLoadChapterDoc).not.toHaveBeenCalled()
    })

    it('returns null when the requested verses do not exist in the fetched chapter', async () => {
        mockLoadChapterDoc.mockResolvedValue(docWithVerses(1, 2, 3))
        expect(await loadReferenceHtml('eng', 'GEN 1:50')).toBeNull()
    })
})
