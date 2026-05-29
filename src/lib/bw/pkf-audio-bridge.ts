/**
 * Bridge between PKF audio data and the bibel-wiki audio store.
 * Call setupPkfAudio() from the Reader when the user selects a chapter.
 */

import {
  setAudioForChapter,
  playVerse,
  $playerVisible,
} from "../../stores/audio-store"
import { buildVerseEntries, type PkfMediaManifest } from "./pkf-audio"

export async function setupPkfAudio(
  iso: string,
  media: PkfMediaManifest | null,
  bookCode: string,
  bookName: string,
  chapter: number,
): Promise<boolean> {
  const { entries, audioUrl } = await buildVerseEntries(iso, media, bookCode, chapter)

  if (!audioUrl || entries.length === 0) return false

  setAudioForChapter({
    distinctId: `${iso}_pkf`,
    bookCode,
    chapter,
    bookName,
    audioUrl,
    verseEntries: entries,
  })

  $playerVisible.set(true)

  return true
}

export async function playPkfChapter(
  iso: string,
  media: PkfMediaManifest | null,
  bookCode: string,
  bookName: string,
  chapter: number,
): Promise<boolean> {
  const ready = await setupPkfAudio(iso, media, bookCode, bookName, chapter)
  if (!ready) return false

  playVerse(0)
  return true
}
