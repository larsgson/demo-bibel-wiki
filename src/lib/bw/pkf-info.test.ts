import { describe, expect, it } from 'vitest'
import { pkfAssetsOf } from './pkf-info'

describe('pkfAssetsOf', () => {
  const info = {
    assets: [{ kind: 'pkf', base: 'ind_C01', name: 'ind_C01.x.pkf' }],
    formats: { sofria: { path: 'sofria/<BOOK>/<chapter>.sofria.json' } },
    glossary: 'glossary.json',
  }

  it('keeps the per-chapter Sofria placeholders literal', () => {
    const url = pkfAssetsOf('ind', info)!.sofriaUrl!
    expect(url).toMatch(/\/pkf\/ind\/sofria\/<BOOK>\/<chapter>\.sofria\.json$/)
    expect(url.replace('<BOOK>', 'JHN').replace('<chapter>', '3')).toMatch(/\/pkf\/ind\/sofria\/JHN\/3\.sofria\.json$/)
  })

  it('has no Sofria URL or glossary when info.json names none', () => {
    const assets = pkfAssetsOf('ind', { assets: info.assets })!
    expect(assets.sofriaUrl).toBeNull()
    expect(assets.glossaryUrl).toBeNull()
  })
})
