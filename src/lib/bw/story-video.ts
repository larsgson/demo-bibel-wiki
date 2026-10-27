/**
 * Story videos hosted on YouTube — the pure parts (no DOM, no fetch), so
 * they can be unit-tested: recognising a YouTube link, turning per-segment
 * timing into scene entries for video-store, and reading the optional
 * video fields of OBS's media.json and the template locale files.
 *
 * Two kinds of story video exist:
 *  - the "test" template's chapter mp4 files (loadVideoManifest), the only
 *    medium those stories have — no audio/video toggle;
 *  - YouTube videos for stories that ALSO have audio (OBS produced
 *    narration taken from YouTube, John's films) — shown behind a toggle,
 *    with audio as the default. Everything here is about this second kind.
 */

import type { VerseEntry } from "../../stores/audio-store"

const YT_ID = /^[A-Za-z0-9_-]{11}$/

/** The 11-character video id of a YouTube link (watch, embed, youtu.be,
 *  shorts, youtube-nocookie), or of a bare id; null for anything else. */
export function parseYouTubeId(urlOrId: string | null | undefined): string | null {
  if (!urlOrId) return null
  const s = urlOrId.trim()
  if (YT_ID.test(s)) return s
  let u: URL
  try {
    u = new URL(s)
  } catch {
    return null
  }
  const host = u.hostname.replace(/^(www|m)\./, "")
  let id: string | null = null
  if (host === "youtu.be") id = u.pathname.split("/")[1] ?? null
  else if (host === "youtube.com" || host === "youtube-nocookie.com") {
    if (u.pathname === "/watch") id = u.searchParams.get("v")
    else {
      const m = u.pathname.match(/^\/(?:embed|shorts|live|v)\/([^/?#]+)/)
      id = m ? m[1] : null
    }
  }
  return id && YT_ID.test(id) ? id : null
}

export function isYouTubeUrl(url: string | null | undefined): boolean {
  return !!url && !YT_ID.test(url.trim()) && parseYouTubeId(url) !== null
}

export function youTubeWatchUrl(id: string): string {
  return `https://www.youtube.com/watch?v=${id}`
}

/** A story's YouTube video: where the story starts in it (seconds) and,
 *  optionally, where it ends. `offset` shifts per-segment audio timing onto
 *  the video when the audio was cut from it (OBS's youtube_offset). */
export interface StoryVideo {
  videoUrl: string
  start: number
  end?: number | null
}

/**
 * Scene entries for video-store from produced-audio segment timing
 * (`{ "1": [start, end], ... }`, one per section, 1-indexed), shifted by
 * the video's offset. Sections without timing are left out, so clicking
 * them plays the nearest earlier scene (see sceneIndexForSection). Returns
 * [] when there is no timing at all.
 */
export function sceneEntriesFromSegments(
  timing: Record<string, [number, number]> | null | undefined,
  sectionCount: number,
  offset = 0,
): VerseEntry[] {
  if (!timing) return []
  const out: VerseEntry[] = []
  for (let i = 0; i < sectionCount; i++) {
    const seg = timing[String(i + 1)]
    if (!seg || !(seg[1] > seg[0])) continue
    out.push({
      verseStart: i + 1,
      verseEnd: i + 1,
      startTime: seg[0] + offset,
      endTime: seg[1] + offset,
      sectionIndex: i,
    })
  }
  return out
}

/**
 * OBS video timing (cdn.bibel.wiki/obs-video/<iso>/<story>_timing.json,
 * detected from the video's frames) as `{ "<picture>": [start, end] }` in
 * video seconds — the same shape as produced-audio segment timing, keyed
 * by OBS picture number, which is the section number in the local OBS
 * stories (their pictures are listed in order, obs-en-<story>-<NN>.jpg).
 * A segment ends where the next begins; the last one where its narration
 * ends (`run_bounds`). A picture shown in several segments spans them all.
 */
export function videoTimingToSegments(
  data: { pos?: number[]; images?: number[]; run_bounds?: [number, number][] } | null | undefined,
): Record<string, [number, number]> | null {
  const pos = data?.pos
  if (!pos?.length) return null
  const out: Record<string, [number, number]> = {}
  for (let k = 0; k < pos.length; k++) {
    const start = pos[k]
    const end = k + 1 < pos.length ? pos[k + 1] : Math.max(data?.run_bounds?.[k]?.[1] ?? 0, start + 1)
    const key = String(data?.images?.[k] ?? k + 1)
    const prev = out[key]
    out[key] = prev ? [Math.min(prev[0], start), Math.max(prev[1], end)] : [start, end]
  }
  return out
}

/** Segment timing moved by `delta` seconds (e.g. video time → audio time
 *  when the audio starts `offset` seconds into the video: delta = -offset). */
export function shiftSegments(
  timing: Record<string, [number, number]>,
  delta: number,
): Record<string, [number, number]> {
  if (!delta) return timing
  const out: Record<string, [number, number]> = {}
  for (const [k, [a, b]] of Object.entries(timing)) out[k] = [Math.max(0, a + delta), Math.max(0, b + delta)]
  return out
}

/** One scene covering the whole story — for a video with no per-section
 *  timing. With no end, it plays to the end of the video. */
export function singleSceneEntries(start: number, end?: number | null): VerseEntry[] {
  return [{
    verseStart: 1,
    verseEnd: 1,
    startTime: start,
    endTime: end != null && end > start ? end : Number.POSITIVE_INFINITY,
    sectionIndex: 0,
  }]
}

/** Index into `entries` of the scene to play when `sectionIndex` is
 *  clicked: that section's own scene, else the nearest earlier one, else
 *  the first. -1 only when there are no scenes. */
export function sceneIndexForSection(entries: VerseEntry[], sectionIndex: number): number {
  if (!entries.length) return -1
  let best = 0
  for (let i = 0; i < entries.length; i++) {
    const s = entries[i].sectionIndex ?? i
    if (s === sectionIndex) return i
    if (s < sectionIndex) best = i
  }
  return best
}

/**
 * `?ytid=<id or link>&ytoffset=<seconds>` — try any YouTube video against a
 * story before the real ids are published (local testing only; there is no
 * UI for it). Applies to stories that have a toggle-able video slot (OBS,
 * John).
 */
export function debugVideoOverride(search: string): { videoUrl: string; offset: number } | null {
  const params = new URLSearchParams(search)
  const id = parseYouTubeId(params.get("ytid"))
  if (!id) return null
  const offset = Number(params.get("ytoffset") ?? 0)
  return { videoUrl: youTubeWatchUrl(id), offset: Number.isFinite(offset) ? offset : 0 }
}

/** The YouTube fields requested for obs/<iso>/media.json (not published
 *  yet — see door43-obs.ts's ObsStoryMedia). */
export function obsStoryVideo(
  stories: Record<string, { youtube_id?: string | null; youtube_offset?: number | null }> | null | undefined,
  storyId: string,
): { videoUrl: string; offset: number } | null {
  const story = stories?.[storyId]
  const id = parseYouTubeId(story?.youtube_id ?? null)
  if (!id) return null
  const offset = Number(story?.youtube_offset ?? 0)
  return { videoUrl: youTubeWatchUrl(id), offset: Number.isFinite(offset) ? offset : 0 }
}

/**
 * A story's YouTube video from a template locale file (parsed TOML):
 *  - `[<cat>.<story>] video_url = "…"` — a video of this story alone
 *    (optional `video_start` / `video_end` within it);
 *  - otherwise the file's top-level `video_url` (one film for the whole
 *    collection, as John has), but ONLY when the story says where it
 *    starts in that film (`[<cat>.<story>] video_start = <seconds>`) —
 *    without that, the toggle would play the film from its beginning on
 *    every story.
 */
export function localeStoryVideo(
  locale: Record<string, unknown> | null | undefined,
  categoryId: string,
  storyId: string,
): StoryVideo | null {
  if (!locale) return null
  const cat = locale[categoryId]
  const story = cat && typeof cat === "object"
    ? (cat as Record<string, unknown>)[storyId] as Record<string, unknown> | undefined
    : undefined
  const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null)
  const start = num(story?.video_start)
  const end = num(story?.video_end)
  const own = typeof story?.video_url === "string" ? parseYouTubeId(story.video_url) : null
  if (own) return { videoUrl: youTubeWatchUrl(own), start: start ?? 0, end }
  const film = typeof locale.video_url === "string" ? parseYouTubeId(locale.video_url) : null
  if (film && start != null) return { videoUrl: youTubeWatchUrl(film), start, end }
  return null
}
