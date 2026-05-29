/**
 * Audio + timing integration for PKF-based languages.
 *
 * Audio URLs come from info.json media.audio.items.
 * Timing files live at /pkf/<iso>/timing/<bookCode>-<chapter>.json
 * Format: [[startSec, endSec, tag], ...] where tag is "s1"/"s2" for
 * sections or "1"/"2a"/"2b" for verses.
 */

import type { VerseEntry } from "../../stores/audio-store"

export interface PkfAudioItem {
  url: string
  bookCode: string
  chapter: number
  hasTiming?: boolean
}

export interface PkfMediaManifest {
  videos: any[]
  audio: {
    base_url: string | null
    items: PkfAudioItem[]
  }
}

type TimingRow = [number, number, string]

export function findAudioItem(
  media: PkfMediaManifest | null,
  bookCode: string,
  chapter: number,
): PkfAudioItem | null {
  if (!media?.audio?.items) return null
  return media.audio.items.find(
    (i) => i.bookCode === bookCode && i.chapter === chapter
  ) ?? null
}

export async function fetchTiming(
  iso: string,
  bookCode: string,
  chapter: number,
): Promise<TimingRow[] | null> {
  try {
    const resp = await fetch(`/pkf/${iso}/timing/${bookCode}-${chapter}.json`)
    if (!resp.ok) return null
    return await resp.json()
  } catch {
    return null
  }
}

export function timingToVerseEntries(
  timing: TimingRow[],
  audioUrl: string,
): VerseEntry[] {
  const verseGroups = new Map<number, { start: number; end: number }>()

  for (const [start, end, tag] of timing) {
    // Skip section markers (s1, s2, ...)
    if (tag.startsWith("s")) continue

    const verseNum = parseInt(tag, 10)
    if (isNaN(verseNum)) continue

    const existing = verseGroups.get(verseNum)
    if (existing) {
      existing.start = Math.min(existing.start, start)
      existing.end = Math.max(existing.end, end)
    } else {
      verseGroups.set(verseNum, { start, end })
    }
  }

  const entries: VerseEntry[] = []
  for (const [verseNum, range] of [...verseGroups.entries()].sort((a, b) => a[0] - b[0])) {
    entries.push({
      verseStart: verseNum,
      verseEnd: verseNum,
      startTime: range.start,
      endTime: range.end,
      audioUrl,
    })
  }

  return entries
}

export async function buildVerseEntries(
  iso: string,
  media: PkfMediaManifest | null,
  bookCode: string,
  chapter: number,
): Promise<{ entries: VerseEntry[]; audioUrl: string | null }> {
  const item = findAudioItem(media, bookCode, chapter)
  if (!item) return { entries: [], audioUrl: null }

  const audioUrl = item.url

  const timing = await fetchTiming(iso, bookCode, chapter)
  if (timing && timing.length > 0) {
    return {
      entries: timingToVerseEntries(timing, audioUrl),
      audioUrl,
    }
  }

  // No timing — single entry for the whole chapter
  return {
    entries: [{
      verseStart: 1,
      verseEnd: 999,
      startTime: 0,
      endTime: Infinity,
      audioUrl,
    }],
    audioUrl,
  }
}
