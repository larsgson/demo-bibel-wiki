import { describe, expect, it } from 'vitest'
import { rankTextEditions, type TextEditionInputs, type OverlapCatalog } from './text-edition'
import type { CanonMedia } from './dbt-media'

// Fixtures below are trimmed, real snapshots of live cdn.bibel.wiki/dbt/<iso>/
// media.json, data/source-catalog.json, and cdn.bibel.wiki/catalog/overlap.json
// responses, confirmed 2026-09-17 — see internal-docs/unified-text-pipeline.md.

function baseInputs(overrides: Partial<TextEditionInputs>): TextEditionInputs {
  return {
    iso: 'xxx',
    canon: 'nt',
    preferredText: null,
    preferred: null,
    canonMedia: null,
    filesets: [],
    pkfAssets: null,
    sourceCatalogSrc: null,
    overlap: null,
    preferredSidecarText: null,
    openbibleEdition: null,
    ...overrides,
  }
}

describe('rankTextEditions — eng (preferredFileset ENGBSBHAY, inline textSource)', () => {
  const canonMedia: CanonMedia = {
    media: 'at',
    filesets: [
      { id: 'EN1ESV', media: 'at', a: ['ENGESHN1DA'], t: 'EN1ESV' },
      {
        id: 'ENGBSBHAY',
        media: 'at',
        a: ['ENGBSBHAY'],
        audioSource: { source: 'helloao', translation: 'BSB', reader: 'hays' },
        t: 'ENGBSBHAY',
        textSource: { source: 'helloao', id: 'BSB', verified: true },
      },
    ],
    h: ['BSB', 'eng_asv'],
  }
  const inputs = baseInputs({
    iso: 'eng',
    preferred: 'ENGBSBHAY',
    canonMedia,
    filesets: [canonMedia.filesets![1], canonMedia.filesets![0]], // preferred-first order
    sourceCatalogSrc: { provider: 'helloao', id: 'eng_asv' },
  })

  it('resolves to BSB via the inline textSource, ahead of source-catalog\'s ASV', () => {
    const ranked = rankTextEditions(inputs)
    expect(ranked[0]).toMatchObject({ provider: 'helloao', id: 'BSB', via: 'preferred-helloao' })
  })

  it('never uses ENGBSBHAY itself as a "paired-dbt" candidate (it has textSource, so pairing skips it)', () => {
    const ranked = rankTextEditions(inputs)
    const pairedIds = ranked.filter((e) => e.via === 'paired-dbt').map((e) => e.id)
    expect(pairedIds).not.toContain('ENGBSBHAYN')
    // EN1ESV (real DBT audio + text, no textSource) is still a valid lower-
    // priority fallback candidate — pairing correctly considers it instead.
    expect(pairedIds).toEqual(['EN1ESVN'])
  })

  it('still lists ASV (source-catalog) as a fallback candidate', () => {
    const ranked = rankTextEditions(inputs)
    expect(ranked.some((e) => e.provider === 'helloao' && e.id === 'eng_asv')).toBe(true)
  })
})

describe('rankTextEditions — fra (DBT paired text upgraded to its verified helloAO twin)', () => {
  const overlap: OverlapCatalog = {
    entries: {
      'fra:nt': [{ ids: ['d:FRALSG', 'd:FRNTLS', 'h:fra_lsg'] }],
      'fra:ot': [{ ids: ['d:FRALSG', 'd:FRNTLS', 'h:fra_lsg'] }],
    },
  }
  const ntMedia: CanonMedia = {
    media: 'at',
    filesets: [
      { id: 'FRALSN', media: 'at', a: ['FRNLSNN1DA'] },
      { id: 'FRAPDV', media: 'at', a: ['FRNPDCN2DA'] },
      { id: 'FRNTLS', media: 'at', a: ['FRNTLSN2DA'], t: 'FRNTLS' },
    ],
    h: ['fra_jnd', 'fra_lsg', 'fra_ncl', 'fra_ost'],
  }

  it('nt: preferredFileset FRNTLS -> twin fra_lsg first, dbt:FRNTLSN as fallback', () => {
    const inputs = baseInputs({
      iso: 'fra',
      canon: 'nt',
      preferred: 'FRNTLS',
      canonMedia: ntMedia,
      filesets: [ntMedia.filesets![2], ntMedia.filesets![0], ntMedia.filesets![1]],
      sourceCatalogSrc: { provider: 'helloao', id: 'fra_lsg' },
      overlap,
    })
    const ranked = rankTextEditions(inputs)
    expect(ranked[0]).toMatchObject({ provider: 'helloao', id: 'fra_lsg', via: 'dbt-twin' })
    expect(ranked[1]).toMatchObject({ provider: 'dbt', id: 'FRNTLSN', via: 'preferred-dbt' })
  })

  it('ot: same edition (FRNTLS), lettered "O"', () => {
    const otMedia: CanonMedia = {
      media: 'at',
      filesets: [
        { id: 'FRALSN', media: 'at', a: ['FRNLSNO1DA'] },
        { id: 'FRNTLS', media: 'at', a: ['FRNTLSO2DA'], t: 'FRNTLS' },
      ],
      h: ['fra_jnd', 'fra_lsg', 'fra_ncl', 'fra_ost'],
    }
    const inputs = baseInputs({
      iso: 'fra',
      canon: 'ot',
      preferred: 'FRNTLS',
      canonMedia: otMedia,
      filesets: [otMedia.filesets![1], otMedia.filesets![0]],
      sourceCatalogSrc: { provider: 'helloao', id: 'fra_jnd' },
      overlap,
    })
    const ranked = rankTextEditions(inputs)
    expect(ranked[0]).toMatchObject({ provider: 'helloao', id: 'fra_lsg', via: 'dbt-twin' })
    expect(ranked[1]).toMatchObject({ provider: 'dbt', id: 'FRNTLSO', via: 'preferred-dbt' })
  })
})

describe('rankTextEditions — spa (paired DBT text with NO verified twin — a lone singleton cluster carries "likely")', () => {
  const overlap: OverlapCatalog = {
    entries: {
      'spa:nt': [{ ids: ['d:SPABDA'], likely: 'dialect_variant' }, { ids: ['d:SPNR02', 'h:spa_r09'] }],
    },
  }
  const ntMedia: CanonMedia = {
    media: 'at',
    filesets: [
      { id: 'SPABDA', media: 'at', a: ['SPNBDAN1DA', 'SPNBDAN2DA'], t: 'SPABDA' },
      { id: 'SPAERV', media: 'at', a: ['SPNERVN1DA'], t: 'SPAERV' },
    ],
    h: ['spa_r09'],
  }

  it('nt: no preferredFileset -> SPABDA wins via pairing (real DBT audio), no twin (its cluster has `likely`)', () => {
    const inputs = baseInputs({
      iso: 'spa',
      canon: 'nt',
      canonMedia: ntMedia,
      filesets: ntMedia.filesets!,
      sourceCatalogSrc: { provider: 'helloao', id: 'spa_r09' },
      overlap,
    })
    const ranked = rankTextEditions(inputs)
    expect(ranked[0]).toMatchObject({ provider: 'dbt', id: 'SPABDAN', via: 'paired-dbt' })
    expect(ranked.some((e) => e.via === 'dbt-twin')).toBe(false)
  })

  it('ot: no DBT text fileset at all -> falls straight to source-catalog helloAO', () => {
    const otMedia: CanonMedia = { media: 'a', filesets: [{ id: 'SPAPDT', media: 'a' }], h: ['spa_r09'] }
    const inputs = baseInputs({
      iso: 'spa',
      canon: 'ot',
      canonMedia: otMedia,
      filesets: otMedia.filesets!,
      sourceCatalogSrc: { provider: 'helloao', id: 'spa_r09' },
    })
    const ranked = rankTextEditions(inputs)
    expect(ranked[0]).toMatchObject({ provider: 'helloao', id: 'spa_r09', via: 'source-catalog' })
  })
})

describe('rankTextEditions — nor (no DBT text fileset id derivable from media.json base id at all)', () => {
  it('resolves via source-catalog verbatim id NORNBS, not a lettered reconstruction', () => {
    const canonMedia: CanonMedia = { media: 'at', filesets: [{ id: 'NBS', media: 'at', a: ['NBSN2DA'] }] }
    const inputs = baseInputs({
      iso: 'nor',
      canon: 'nt',
      canonMedia,
      filesets: canonMedia.filesets!,
      sourceCatalogSrc: { provider: 'dbt', id: 'NORNBS' },
    })
    const ranked = rankTextEditions(inputs)
    expect(ranked).toEqual([{ provider: 'dbt', id: 'NORNBS', canon: 'nt', via: 'source-catalog-dbt' }])
  })
})

describe('rankTextEditions — ahr (DBT paired text, single-source cluster has no h: id at all -> no twin)', () => {
  it('nt: pairs to dbt:AHRDPIN, no twin, ahr_twf listed only as a last-resort h[] fallback', () => {
    const overlap: OverlapCatalog = { entries: { 'ahr:nt': [{ ids: ['d:AHRDPI'] }] } }
    const canonMedia: CanonMedia = {
      media: 'at',
      filesets: [{ id: 'AHRDPI', media: 'at', a: ['AHRDPIN1DA'], t: 'AHRDPI' }],
      h: ['ahr_twf'],
    }
    const inputs = baseInputs({
      iso: 'ahr',
      canon: 'nt',
      canonMedia,
      filesets: canonMedia.filesets!,
      sourceCatalogSrc: { provider: 'dbt', id: 'AHRDPI' },
      overlap,
    })
    const ranked = rankTextEditions(inputs)
    expect(ranked[0]).toMatchObject({ provider: 'dbt', id: 'AHRDPIN', via: 'paired-dbt' })
    expect(ranked.some((e) => e.via === 'dbt-twin')).toBe(false)
    expect(ranked.at(-1)).toMatchObject({ provider: 'helloao', id: 'ahr_twf', via: 'media-h' })
  })

  it('ot: no canon media at all -> empty candidate list', () => {
    const inputs = baseInputs({ iso: 'ahr', canon: 'ot' })
    expect(rankTextEditions(inputs)).toEqual([])
  })
})

describe('rankTextEditions — ind (PKF for NT; OT drops a source-catalog id media.json h[] does not list)', () => {
  it('nt: PKF ranks first, ahead of every DBT/helloAO candidate', () => {
    const canonMedia: CanonMedia = {
      media: 'at',
      filesets: [{ id: 'INDALA', media: 'at', a: ['INDALAN1DA'], t: 'INDALA' }],
      h: ['ind_ags', 'ind_ayt', 'ind_obo'],
    }
    const inputs = baseInputs({
      iso: 'ind',
      canon: 'nt',
      canonMedia,
      filesets: canonMedia.filesets!,
      pkfAssets: {
        docSetId: 'ind_C01',
        pkfUrl: 'https://cdn.bibel.wiki/pkf/ind/ind_C01.pkf',
        catalogUrl: 'https://cdn.bibel.wiki/pkf/ind/ind_C01.json',
        styleUrl: 'https://cdn.bibel.wiki/pkf/ind/styles/bundle.css',
        figureUrls: {},
        media: {},
      },
      sourceCatalogSrc: { provider: 'pkf' },
    })
    const ranked = rankTextEditions(inputs)
    expect(ranked[0]).toMatchObject({ provider: 'pkf', id: 'ind_C01', via: 'pkf' })
  })

  it('ot: source-catalog\'s ind_ags is dropped because media.json\'s own OT h[] does not include it', () => {
    const canonMedia: CanonMedia = {
      media: 'at',
      filesets: [{ id: 'INDALA', media: 'at', a: ['INDALAO1DA'], t: 'INDALA' }],
      h: ['ind_ayt', 'ind_obo'], // no "ind_ags" here — the real live gap this catches
    }
    const inputs = baseInputs({
      iso: 'ind',
      canon: 'ot',
      canonMedia,
      filesets: canonMedia.filesets!,
      sourceCatalogSrc: { provider: 'helloao', id: 'ind_ags' },
    })
    const ranked = rankTextEditions(inputs)
    expect(ranked.some((e) => e.id === 'ind_ags')).toBe(false)
    // Falls through to the paired/media-dbt tier and media.json's own h[] instead.
    expect(ranked[0]).toMatchObject({ provider: 'dbt', id: 'INDALAO' })
    expect(ranked.map((e) => e.id)).toContain('ind_ayt')
  })
})

describe('rankTextEditions — precedence + dedupe', () => {
  it('an explicit preferredText config beats everything else, including PKF', () => {
    const inputs = baseInputs({
      preferredText: { source: 'helloao', id: 'FORCED' },
      pkfAssets: { docSetId: 'x', pkfUrl: '', catalogUrl: null, styleUrl: '', figureUrls: {}, media: {} },
    })
    const ranked = rankTextEditions(inputs)
    expect(ranked[0]).toMatchObject({ provider: 'helloao', id: 'FORCED', via: 'preferred-text' })
    expect(ranked[1]?.provider).toBe('pkf')
  })

  it('openbible only ever appears last', () => {
    const inputs = baseInputs({
      openbibleEdition: 'MGJ',
      sourceCatalogSrc: { provider: 'helloao', id: 'some_tid' },
    })
    const ranked = rankTextEditions(inputs)
    expect(ranked.at(-1)).toMatchObject({ provider: 'openbible', id: 'MGJ' })
  })

  it('never lists the same provider:id twice even if multiple tiers would add it', () => {
    const canonMedia: CanonMedia = {
      media: 'at',
      filesets: [{ id: 'X', media: 'at', a: ['XN1DA'], t: 'X' }],
      h: ['tid'],
    }
    const inputs = baseInputs({
      iso: 'zzz',
      preferred: 'X',
      canonMedia,
      filesets: canonMedia.filesets!,
      sourceCatalogSrc: { provider: 'dbt', id: 'XN' }, // same id "media-dbt"/"preferred-dbt" would also produce
    })
    const ranked = rankTextEditions(inputs)
    const ids = ranked.filter((e) => e.provider === 'dbt' && e.id === 'XN')
    expect(ids).toHaveLength(1)
  })
})
