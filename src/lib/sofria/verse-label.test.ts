import { describe, expect, it } from 'vitest'
import {
  normalizeVerseLabel,
  parseVerseLabel,
  verseLabelStart,
  verseLabelIncludes,
  verseLabelOverlaps,
} from './verse-label'

describe('normalizeVerseLabel', () => {
  it('strips bidi marks and spaces, unifies dashes', () => {
    expect(normalizeVerseLabel('‏2–3 ')).toBe('2-3')
    expect(normalizeVerseLabel('⁦5— 7⁩')).toBe('5-7')
    expect(normalizeVerseLabel('12')).toBe('12')
  })
})

describe('parseVerseLabel', () => {
  it.each([
    ['1', { start: 1, end: 1 }],
    ['3a', { start: 3, end: 3 }],
    ['2-3', { start: 2, end: 3 }],
    ['17b-23', { start: 17, end: 23 }],
    ['2,3', { start: 2, end: 3 }],
    ['‏4–6', { start: 4, end: 6 }],
  ])('%s', (label, want) => {
    expect(parseVerseLabel(label)).toEqual(want)
  })

  it.each(['title', 'none', 's1', '', 'a'])('%s is not a verse', (label) => {
    expect(parseVerseLabel(label)).toBeNull()
  })

  it('never returns a range that runs backwards', () => {
    expect(parseVerseLabel('5-3')).toEqual({ start: 5, end: 5 })
  })
})

describe('integer adapters', () => {
  it('verseLabelStart', () => {
    expect(verseLabelStart('3a')).toBe(3)
    expect(verseLabelStart('17b-23')).toBe(17)
    expect(verseLabelStart('s2')).toBeNull()
  })

  it('verseLabelIncludes', () => {
    expect(verseLabelIncludes('2-3', 2)).toBe(true)
    expect(verseLabelIncludes('2-3', 3)).toBe(true)
    expect(verseLabelIncludes('2-3', 4)).toBe(false)
    expect(verseLabelIncludes('title', 1)).toBe(false)
  })

  it('verseLabelOverlaps', () => {
    expect(verseLabelOverlaps('17b-23', 20, 30)).toBe(true)
    expect(verseLabelOverlaps('17b-23', 1, 17)).toBe(true)
    expect(verseLabelOverlaps('17b-23', 24, 30)).toBe(false)
    expect(verseLabelOverlaps('5', 5, 5)).toBe(true)
  })
})
