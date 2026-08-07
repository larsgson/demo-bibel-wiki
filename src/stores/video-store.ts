import { atom } from "nanostores"
import {
  $currentVerseIdx,
  $currentVerseEntries,
  $audioPlayState,
  $pausedState,
  $playerVisible,
  $playerCardInfo,
  $focusMode,
  $audioPageStory,
  $audioToast,
  type VerseEntry,
} from "./audio-store"

/**
 * Chapter-video playback — the same "click a section, it plays through
 * consecutive sections" UX as audio-store.ts, but for templates whose story
 * is one video per chapter with per-scene [start, end] ranges (see the
 * "test" template) rather than Bible-verse audio. Deliberately a SEPARATE,
 * parallel module rather than a generalization of audio-store.ts: that file
 * is load-bearing for every other template (OBS/John/TGS) and has real
 * complexity (PKF/DBT/helloAO fallback, dual-language secondary audio) that
 * doesn't apply here at all. This shares the same underlying reactive
 * stores ($focusMode, $currentVerseIdx, $currentVerseEntries, $playerVisible,
 * $playerCardInfo, $audioPageStory) so BaseLayout.astro's existing
 * mini-player/focus-panel UI wiring reacts to video playback for free,
 * without needing a second parallel UI shell — see $playerMediaKind below,
 * which is what tells BaseLayout whether to show the video element or the
 * usual per-section image in those shared slots.
 *
 * A page is always either audio-driven or video-driven, never both at once
 * (different templates render different story-reader components) — so
 * there's no real risk of the two systems fighting over shared state within
 * one page load; navigating to a different story is a full page load
 * anyway, which tears down whichever media element was active.
 */

export type PlayerMediaKind = "audio" | "video"

/** Which kind of media the shared mini-player/focus-panel are currently
 *  showing. BaseLayout.astro reads this to decide whether to render the
 *  persistent <video> element (see getVideoElement()) into those slots, or
 *  fall back to its normal per-section <img>. Resets to "audio" whenever
 *  video playback stops, so the shared UI reverts to its default. */
export const $playerMediaKind = atom<PlayerMediaKind>("audio")

/** The chapter video's URL — one per chapter, shared by every scene entry
 *  in $currentVerseEntries (unlike audio, which can vary per verse). Set
 *  once via setVideoForChapter, not per-entry. */
const $activeVideoUrl = atom<string | null>(null)

// ---- Video element singleton ----
// Lazily created, kept out of the DOM until BaseLayout re-parents it into
// the active slot (mini-player vs focus-panel) — see BaseLayout.astro's
// $playerMediaKind subscription. Re-parenting (not cloning) is what lets
// playback continue uninterrupted across the two visual modes.

let primaryVideo: HTMLVideoElement | null = null
let primaryVideoSrc = ""

export function getVideoElement(): HTMLVideoElement {
  if (!primaryVideo) {
    primaryVideo = document.createElement("video")
    primaryVideo.playsInline = true
    primaryVideo.className = "chapter-video"
    primaryVideo.addEventListener("timeupdate", onVideoTimeUpdate)
    primaryVideo.addEventListener("ended", onVideoEnded)
    primaryVideo.addEventListener("error", () => {
      console.warn("Video error:", primaryVideo?.error?.message || "unknown")
      if ($audioPlayState.get() !== "idle") stopVideo()
    })
  }
  return primaryVideo
}

function seekAndPlayVideo(url: string, startTime: number) {
  const v = getVideoElement()
  if (primaryVideoSrc === url) {
    v.currentTime = startTime
    v.play().catch(() => {})
  } else {
    primaryVideoSrc = url
    v.src = url
    v.addEventListener("canplay", function onCanPlay() {
      v.removeEventListener("canplay", onCanPlay)
      v.currentTime = startTime
      v.play().catch(() => {})
    })
  }
}

function updateVideoPlayerCardInfo(idx: number) {
  // No book/verse concept for video — keep whatever title the page set
  // (see setVideoForChapter) and clear imageUrl so BaseLayout's existing
  // "if (imageUrl) show <img>" branch stays a no-op; the video element
  // itself is what's visible.
  const title = $playerCardInfo.get().title
  $playerCardInfo.set({ title, imageUrl: null })
}

// ---- Timeupdate handling (scene-boundary detection + auto-advance) ----

function onVideoTimeUpdate() {
  if ($playerMediaKind.get() !== "video" || $audioPlayState.get() === "idle") return
  const v = primaryVideo
  const entries = $currentVerseEntries.get()
  if (!v || !entries.length) return

  const currentTime = v.currentTime
  const idx = $currentVerseIdx.get()
  const entry = entries[idx]
  if (!entry) return

  // Past this scene's end — advance to the next one (still the same video,
  // just a later range, unless it's the last scene).
  if (entry.endTime > entry.startTime && currentTime >= entry.endTime) {
    const nextIdx = idx + 1
    if (nextIdx < entries.length && entries[nextIdx].endTime > entries[nextIdx].startTime) {
      playScene(nextIdx)
    } else {
      stopVideo()
    }
    return
  }

  // Support scrubbing/seeking within the video by re-deriving which scene
  // currentTime actually falls into (mirrors audio-store's back-tracking).
  for (let i = entries.length - 1; i >= 0; i--) {
    const e = entries[i]
    if (e.startTime >= 0 && currentTime >= e.startTime) {
      if (i !== idx) {
        $currentVerseIdx.set(i)
        updateVideoPlayerCardInfo(i)
      }
      break
    }
  }
}

function onVideoEnded() {
  if ($playerMediaKind.get() !== "video") return
  stopVideo()
}

// ---- Public actions ----

export function playScene(idx: number) {
  const entries = $currentVerseEntries.get()
  const entry = entries[idx]
  const videoUrl = $activeVideoUrl.get()
  if (!entry || idx >= entries.length || !videoUrl) {
    stopVideo()
    return
  }
  if (entry.startTime === 0 && entry.endTime === 0) {
    $audioToast.set("noTimingAvailable")
    return
  }

  $playerMediaKind.set("video")
  $currentVerseIdx.set(idx)
  $audioPlayState.set("playing_primary")
  $pausedState.set(null)
  $playerVisible.set(true)

  updateVideoPlayerCardInfo(idx)
  seekAndPlayVideo(videoUrl, entry.startTime)
}

export function pauseVideoPlayback() {
  primaryVideo?.pause()
  $pausedState.set({ verseIdx: $currentVerseIdx.get(), wasSecondary: false })
  $audioPlayState.set("idle")
  // playerVisible stays true when paused, matching audio-store's pausePlayback
}

export function resumeVideoPlayback() {
  const paused = $pausedState.get()
  if (!paused || !primaryVideo) return
  $currentVerseIdx.set(paused.verseIdx)
  $audioPlayState.set("playing_primary")
  primaryVideo.play().catch(() => {})
  $pausedState.set(null)
}

export function stopVideo() {
  primaryVideo?.pause()
  $audioPlayState.set("idle")
  $pausedState.set(null)
  $focusMode.set(false)
  $playerVisible.set(false)
  $playerMediaKind.set("audio")
}

/**
 * Prepare video context for a newly opened chapter — called once by the
 * story reader when it resolves a video-driven template's scene entries.
 * Mirrors audio-store's setAudioForChapter, minus the multi-chapter
 * same-context preservation (this app always full-reloads between stories,
 * so there's no "returning to the same chapter mid-playback" case to
 * preserve here).
 */
export function setVideoForChapter(params: {
  storyKey: string
  title: string
  videoUrl: string
  sceneEntries: VerseEntry[]
}) {
  if ($audioPlayState.get() !== "idle") stopVideo()
  $activeVideoUrl.set(params.videoUrl)
  $currentVerseEntries.set(params.sceneEntries)
  $audioPageStory.set(params.storyKey)
  $playerCardInfo.set({ title: params.title, imageUrl: null })
}
