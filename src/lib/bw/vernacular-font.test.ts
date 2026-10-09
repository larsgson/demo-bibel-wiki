import { describe, expect, it } from 'vitest'
import { extractFontFaces } from './vernacular-font'
import { pkfStyleUrls } from './pkf-info'

// Shape of a live cdn.bibel.wiki/pkf/<iso>/styles/delta.css (minified, fonts
// in the shared ../../_fonts/ directory).
const DELTA_CSS = [
  '@font-face{font-family:ind-font1;src:url(../../_fonts/Gentium-Regular.158d8954.ttf) format("truetype");font-weight:400;font-style:normal}',
  '@font-face{font-family:"ind-font1";src:url("../../_fonts/Gentium-Bold.320bcd72.ttf") format("truetype");font-weight:700}',
  ':is(#container,.reader-root):where([data-iso="ind"]){font-family:ind-font1;font-size:20px}',
].join('\n')

const CSS_URL = 'https://cdn.bibel.wiki/pkf/ind/styles/delta.css'

describe('extractFontFaces', () => {
  it('keeps only @font-face rules, renamed, with fonts resolved against the stylesheet', () => {
    const out = extractFontFaces(DELTA_CSS, CSS_URL, 'vf-ind')
    expect(out).toBe(
      [
        '@font-face{font-family: vf-ind;src:url(https://cdn.bibel.wiki/pkf/_fonts/Gentium-Regular.158d8954.ttf) format("truetype");font-weight:400;font-style:normal}',
        '@font-face{font-family: vf-ind;src:url("https://cdn.bibel.wiki/pkf/_fonts/Gentium-Bold.320bcd72.ttf") format("truetype");font-weight:700}',
      ].join('\n'),
    )
  })

  it('renames a family declared last in the block (no trailing semicolon)', () => {
    const css = '@font-face{src:url(f.ttf);font-family:x}'
    expect(extractFontFaces(css, CSS_URL, 'vf-x')).toBe(
      '@font-face{src:url(https://cdn.bibel.wiki/pkf/ind/styles/f.ttf);font-family: vf-x}',
    )
  })

  it('leaves absolute and data: urls alone', () => {
    const css = '@font-face{font-family:x;src:url(https://fonts.example/a.woff2),url(data:font/woff2;base64,AAAA)}'
    expect(extractFontFaces(css, CSS_URL, 'vf-x')).toContain(
      'src:url(https://fonts.example/a.woff2),url(data:font/woff2;base64,AAAA)',
    )
  })

  it('returns an empty string when there is no @font-face', () => {
    expect(extractFontFaces(':is(#container){color:red}', CSS_URL, 'vf-x')).toBe('')
  })
})

describe('pkfStyleUrls', () => {
  it('resolves style_delta from info.json against /pkf/<iso>/', () => {
    const urls = pkfStyleUrls('ind', { style_shared: '../_styles/sab-scripture.css', style_delta: 'styles/delta.css' })
    expect(urls.at(-1)).toMatch(/\/pkf\/ind\/styles\/delta\.css$/)
  })

  it('does not load the unscoped shared sheet yet', () => {
    const urls = pkfStyleUrls('ind', { style_shared: '../_styles/sab-scripture.css', style_delta: 'styles/delta.css' })
    expect(urls.some((u) => u.includes('sab-scripture.css'))).toBe(false)
  })

  it('defaults to styles/delta.css when info.json has no style_delta', () => {
    expect(pkfStyleUrls('ind', {}).at(-1)).toMatch(/\/pkf\/ind\/styles\/delta\.css$/)
  })
})
