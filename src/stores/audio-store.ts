import { atom, computed } from "nanostores"

// ---- Types ----

export interface VerseEntry {
  verseStart: number
  verseEnd: number
  startTime: number
  endTime: number
  audioUrl?: string | null
  /** Visual section index — multiple entries can share the same sectionIndex */
  sectionIndex?: number
  /** Book code for this entry (e.g. "GEN") — needed for multi-book stories */
  bookCode?: string
  /** Chapter number for this entry — needed for multi-book stories */
  chapter?: number
  /** Resolved image URL from the section's markdown */
  imageUrl?: string | null
}

export type AudioPlayState = "idle" | "playing_primary" | "playing_secondary"

/** Information about what chapter the audio is playing */
export interface AudioContext {
  distinctId: string
  bookCode: string
  chapter: number
  bookName: string
}

export interface PausedState {
  verseIdx: number
  wasSecondary: boolean
}

// ---- Atoms ----

export const $audioPlayState = atom<AudioPlayState>("idle")
export const $audioContext = atom<AudioContext | null>(null)
export const $currentVerseIdx = atom<number>(0)
export const $currentVerseEntries = atom<VerseEntry[]>([])
export const $secondaryVerseEntries = atom<VerseEntry[]>([])
export const $cachedAudioUrl = atom<string | null>(null)
export const $cachedSecondaryAudioUrl = atom<string | null>(null)
export const $pausedState = atom<PausedState | null>(null)
export const $audioUnlocked = atom<boolean>(false)
export const $playerVisible = atom<boolean>(false)
export const $playerCardInfo = atom<{ title: string; imageUrl: string | null }>({
  title: "\u2014",
  imageUrl: null,
})
export const $focusMode = atom<boolean>(false)
/** Identifies the story that audio is playing for */
export const $audioPageStory = atom<string>("")
/** Transient toast message shown when audio cannot play */
export const $audioToast = atom<string>("")

// ---- Derived stores ----

export const $isPlaying = computed($audioPlayState, (s) => s !== "idle")

// ---- Audio element singletons ----

let primaryAudio: HTMLAudioElement | null = null
let secondaryAudio: HTMLAudioElement | null = null
let primaryAudioSrc = ""
let secondaryAudioSrc = ""

export function getAudioElements() {
  if (!primaryAudio) {
    primaryAudio = new Audio()
    secondaryAudio = new Audio()
    primaryAudio.addEventListener("error", () => {
      console.warn("Audio error (primary):", primaryAudio?.error?.message || "unknown")
      if ($audioPlayState.get() !== "idle") stopAll()
    })
    secondaryAudio!.addEventListener("error", () => {
      console.warn("Audio error (secondary):", secondaryAudio?.error?.message || "unknown")
      if ($audioPlayState.get() !== "idle") stopAll()
    })
    primaryAudio.addEventListener("timeupdate", onPrimaryTimeUpdate)
    secondaryAudio!.addEventListener("timeupdate", onSecondaryTimeUpdate)
  }
  return { primaryAudio: primaryAudio!, secondaryAudio: secondaryAudio! }
}


// ---- Internal helpers ----

function seekAndPlay(
  audioEl: HTMLAudioElement,
  currentSrc: string,
  url: string,
  startTime: number,
  setSrc: (s: string) => void,
) {
  if (currentSrc === url) {
    audioEl.currentTime = startTime
    audioEl.play().catch(() => {})
  } else {
    setSrc(url)
    audioEl.src = url
    audioEl.addEventListener("canplay", function onCanPlay() {
      audioEl.removeEventListener("canplay", onCanPlay)
      audioEl.currentTime = startTime
      audioEl.play().catch(() => {})
    })
  }
}

function updatePlayerCardInfo(idx: number) {
  const entries = $currentVerseEntries.get()
  const ctx = $audioContext.get()
  if (!ctx || !entries[idx]) return

  const entry = entries[idx]
  const chapter = entry.chapter ?? ctx.chapter
  const verseDisplay =
    entry.verseStart === entry.verseEnd
      ? String(entry.verseStart)
      : `${entry.verseStart}-${entry.verseEnd}`

  const title = `${ctx.bookName} ${chapter}:${verseDisplay}`

  // Image from the verse entry (rule 5), keep previous if none (rule 6)
  const imageUrl = entry.imageUrl ?? $playerCardInfo.get().imageUrl

  $playerCardInfo.set({ title, imageUrl })
}

// ---- Timeupdate handlers (boundary detection) ----

function onPrimaryTimeUpdate() {
  if ($audioPlayState.get() !== "playing_primary") return
  const entries = $currentVerseEntries.get()
  if (!entries.length || !primaryAudio) return

  const currentTime = primaryAudio.currentTime
  const idx = $currentVerseIdx.get()

  // Find the audio URL for the currently playing entry
  const playingUrl = entries[idx]?.audioUrl || $cachedAudioUrl.get()

  // Find the CONSECUTIVE run of entries sharing the same audio URL AND contiguous timing.
  // Break when URL changes or there's a time gap (e.g., verse 5 → verse 14).
  let groupEnd = idx
  for (let i = idx + 1; i < entries.length; i++) {
    const entryUrl = entries[i].audioUrl || $cachedAudioUrl.get()
    if (entryUrl !== playingUrl) break
    // Check for time gap: previous entry's endTime should match this entry's startTime
    const prevEntry = entries[i - 1]
    if (prevEntry.endTime > prevEntry.startTime && entries[i].startTime > prevEntry.endTime + 0.5) break
    groupEnd = i
  }

  // Find the last entry in this consecutive group that has actual timing
  let lastTimed: typeof entries[0] | null = null
  let lastTimedIdx = -1
  for (let i = groupEnd; i >= idx; i--) {
    if (entries[i].endTime > entries[i].startTime) {
      lastTimed = entries[i]
      lastTimedIdx = i
      break
    }
  }

  // At end of last timed verse in this consecutive group, advance to next entry
  if (lastTimed && currentTime >= lastTimed.endTime) {
    // Find next entry that has actual timing data (skip no-timing entries)
    let nextIdx = -1
    for (let i = groupEnd + 1; i < entries.length; i++) {
      if (entries[i].endTime > entries[i].startTime) {
        nextIdx = i
        break
      }
    }
    if (nextIdx >= 0) {
      playVerse(nextIdx)
    } else {
      stopAll()
    }
    return
  }

  // Find which entry we're currently in by matching time — only within the consecutive group
  for (let i = groupEnd; i >= idx; i--) {
    const e = entries[i]
    if (e.startTime > 0 && currentTime >= e.startTime) {
      if (i !== idx) {
        $currentVerseIdx.set(i)
        updatePlayerCardInfo(i)
      }
      break
    }
  }
}

function onSecondaryTimeUpdate() {
  if ($audioPlayState.get() !== "playing_secondary") return
  const entries = $secondaryVerseEntries.get()
  const idx = $currentVerseIdx.get()
  const entry = entries[idx]
  if (!entry || !secondaryAudio) return
  if (entry.endTime > entry.startTime && secondaryAudio.currentTime >= entry.endTime) {
    secondaryAudio.pause()
    advanceToNextVerse()
  }
}

// ---- Public actions ----

export function playVerse(idx: number) {
  const entries = $currentVerseEntries.get()
  const entry = entries[idx]
  const audioUrl = entry?.audioUrl || $cachedAudioUrl.get()
  if (idx >= entries.length || !audioUrl) {
    stopAll()
    return
  }

  // Skip entries with no timing data (startTime and endTime both 0)
  if (entry.startTime === 0 && entry.endTime === 0) {
    $audioToast.set("noTimingAvailable")
    return
  }

  const { primaryAudio: pa } = getAudioElements()

  $currentVerseIdx.set(idx)
  $audioPlayState.set("playing_primary")
  $pausedState.set(null)
  $playerVisible.set(true)

  updatePlayerCardInfo(idx)

  seekAndPlay(pa, primaryAudioSrc, audioUrl, entry.startTime, (s) => {
    primaryAudioSrc = s
  })
}

export function playSecondaryForVerse(idx: number) {
  const secondaryUrl = $cachedSecondaryAudioUrl.get()
  const entries = $secondaryVerseEntries.get()
  if (!secondaryUrl || idx >= entries.length) {
    advanceToNextVerse()
    return
  }
  const { secondaryAudio: sa } = getAudioElements()
  const entry = entries[idx]
  $audioPlayState.set("playing_secondary")
  seekAndPlay(sa, secondaryAudioSrc, secondaryUrl, entry.startTime, (s) => {
    secondaryAudioSrc = s
  })
}

export function advanceToNextVerse() {
  const entries = $currentVerseEntries.get()
  // Find next section that has actual timing data (skip no-timing entries)
  let nextIdx = -1
  for (let i = $currentVerseIdx.get() + 1; i < entries.length; i++) {
    if (entries[i].endTime > entries[i].startTime) {
      nextIdx = i
      break
    }
  }
  if (nextIdx < 0) {
    stopAll()
    return
  }
  playVerse(nextIdx)
  // scrollToVerse is handled by the page subscriber
}

export function stopAll() {
  const els = getAudioElements()
  els.primaryAudio.pause()
  els.secondaryAudio.pause()
  $audioPlayState.set("idle")
  $pausedState.set(null)
  $focusMode.set(false)
  $playerVisible.set(false)
}

export function pausePlayback() {
  const wasSecondary = $audioPlayState.get() === "playing_secondary"
  $pausedState.set({ verseIdx: $currentVerseIdx.get(), wasSecondary })
  const els = getAudioElements()
  els.primaryAudio.pause()
  els.secondaryAudio.pause()
  $audioPlayState.set("idle")
  // playerVisible stays true when paused
}

export function resumePlayback() {
  const paused = $pausedState.get()
  if (!paused) return
  const els = getAudioElements()
  $currentVerseIdx.set(paused.verseIdx)
  if (paused.wasSecondary && $cachedSecondaryAudioUrl.get()) {
    $audioPlayState.set("playing_secondary")
    els.secondaryAudio.play().catch(() => {})
  } else {
    $audioPlayState.set("playing_primary")
    els.primaryAudio.play().catch(() => {})
  }
  $pausedState.set(null)
}

/**
 * Prepare audio context for a new chapter.
 * Called by the page script when entering a verses view.
 * Returns true if same chapter was already playing (state preserved).
 */
export function setAudioForChapter(params: {
  distinctId: string
  bookCode: string
  chapter: number
  bookName: string
  audioUrl: string | null
  verseEntries: VerseEntry[]
  secondaryAudioUrl?: string | null
  secondaryVerseEntries?: VerseEntry[]
}): boolean {
  const currentCtx = $audioContext.get()
  const isSameChapter =
    currentCtx &&
    currentCtx.distinctId === params.distinctId &&
    currentCtx.bookCode === params.bookCode &&
    currentCtx.chapter === params.chapter

  // If audio is playing for a different chapter, stop audio but preserve focus mode
  if (!isSameChapter && $audioPlayState.get() !== "idle") {
    const els = getAudioElements()
    els.primaryAudio.pause()
    els.secondaryAudio.pause()
    $audioPlayState.set("idle")
    $pausedState.set(null)
    $playerVisible.set(false)
  }

  $audioContext.set({
    distinctId: params.distinctId,
    bookCode: params.bookCode,
    chapter: params.chapter,
    bookName: params.bookName,
  })
  $cachedAudioUrl.set(params.audioUrl)
  $currentVerseEntries.set(params.verseEntries)
  $cachedSecondaryAudioUrl.set(params.secondaryAudioUrl ?? null)
  $secondaryVerseEntries.set(params.secondaryVerseEntries ?? [])

  // If returning to the same chapter that was playing/paused, preserve state
  if (isSameChapter && ($audioPlayState.get() !== "idle" || $pausedState.get())) {
    return true
  }

  return false
}

// ---- iOS audio unlock ----

const SILENT_WAV = "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAIA+AAACABAAZGF0YQAAAAA="

export function unlockAudio() {
  if ($audioUnlocked.get()) return
  $audioUnlocked.set(true)

  // Build a proper-length silent WAV (10ms) as a Blob URL.
  // Data URIs that are too short may not register as valid playback on some iOS versions.
  const sr = 44100
  const n = 441
  const buf = new ArrayBuffer(44 + n * 2)
  const v = new DataView(buf)
  const w = (o: number, s: string) => {
    for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i))
  }
  w(0, "RIFF")
  v.setUint32(4, 36 + n * 2, true)
  w(8, "WAVE")
  w(12, "fmt ")
  v.setUint32(16, 16, true)
  v.setUint16(20, 1, true)
  v.setUint16(22, 1, true)
  v.setUint32(24, sr, true)
  v.setUint32(28, sr * 2, true)
  v.setUint16(32, 2, true)
  v.setUint16(34, 16, true)
  w(36, "data")
  v.setUint32(40, n * 2, true)
  const blob = new Blob([buf], { type: "audio/wav" })
  const url = URL.createObjectURL(blob)

  // Unlock the actual audio elements synchronously within the user gesture.
  // iOS requires play() on the same elements that will be used for playback.
  const { primaryAudio: pa, secondaryAudio: sa } = getAudioElements()
  pa.src = url
  pa.play().then(() => pa.pause()).catch(() => {})
  sa.src = url
  sa.play().then(() => sa.pause()).catch(() => {})

  // Do NOT clear .src — it would race with playVerse if triggered on the same gesture.
  // Revoke the blob URL after a short delay.
  setTimeout(() => URL.revokeObjectURL(url), 500)
}
