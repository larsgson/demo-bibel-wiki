/**
 * The YouTube backend of video-store's chapter video (see story-video.ts
 * for which stories use it).
 *
 * Moving an <iframe> in the DOM reloads it, so unlike the mp4 <video>
 * element the YouTube player can't be re-parented between the mini-player
 * and the focus panel. Instead:
 *  - the iframe lives in one fixed HOST element, attached once to a
 *    container (BaseLayout attaches #focus-panel) and never moved;
 *  - callers place a SLOT placeholder wherever the video should appear;
 *    every animation frame the host is laid over the slot, or hidden
 *    (still playing) while the slot isn't on screen.
 *
 * The iframe API has no timeupdate event; the current time is polled
 * every 250 ms while playing and reported through the handlers.
 */

interface YTPlayer {
  playVideo(): void
  pauseVideo(): void
  seekTo(seconds: number, allowSeekAhead: boolean): void
  getCurrentTime(): number
  loadVideoById(opts: { videoId: string; startSeconds?: number }): void
  getVideoData?(): { video_id?: string }
}

interface YTNamespace {
  Player: new (el: HTMLElement, opts: Record<string, unknown>) => YTPlayer
  PlayerState: { ENDED: number; PLAYING: number; PAUSED: number }
}

export interface YouTubeHandlers {
  onTime(seconds: number): void
  onEnded(): void
  /** YouTube's error code: 2 bad id, 5 HTML5 error, 100 removed/private,
   *  101/150 embedding not allowed. */
  onError(code: number): void
}

let handlers: YouTubeHandlers = { onTime() {}, onEnded() {}, onError() {} }
let apiPromise: Promise<YTNamespace> | null = null
let player: YTPlayer | null = null
let playerReady: Promise<void> | null = null
let currentId = ""
let host: HTMLDivElement | null = null
let hostContainer: HTMLElement | null = null
let slot: HTMLDivElement | null = null
let pollTimer: ReturnType<typeof setInterval> | null = null
let rafId = 0

export function setYouTubeHandlers(h: YouTubeHandlers) {
  handlers = h
}

/** Start loading YouTube's iframe API (idempotent) — call as soon as video
 *  mode is chosen, so the first click doesn't wait for it. */
export function preloadYouTubeApi(): Promise<YTNamespace> {
  if (apiPromise) return apiPromise
  apiPromise = new Promise((resolve, reject) => {
    const w = window as unknown as { YT?: YTNamespace & { loaded?: number }; onYouTubeIframeAPIReady?: () => void }
    if (w.YT?.Player) return resolve(w.YT)
    const prev = w.onYouTubeIframeAPIReady
    w.onYouTubeIframeAPIReady = () => {
      prev?.()
      resolve(w.YT!)
    }
    const s = document.createElement("script")
    s.src = "https://www.youtube.com/iframe_api"
    s.async = true
    s.onerror = () => {
      apiPromise = null
      reject(new Error("YouTube iframe API failed to load"))
    }
    document.head.appendChild(s)
  })
  return apiPromise
}

/** The placeholder to put wherever the video should show (any number of
 *  moves is fine). */
export function youTubeSlot(): HTMLDivElement {
  if (!slot) {
    slot = document.createElement("div")
    slot.className = "chapter-video-slot"
    slot.style.aspectRatio = "16 / 9"
    slot.style.width = "100%"
    slot.style.background = "#000"
  }
  return slot
}

/** Where the iframe host lives. Must contain every place the slot can be
 *  put while it should be visible (BaseLayout: #focus-panel). */
export function attachYouTubeHost(container: HTMLElement) {
  hostContainer = container
  if (host && host.parentElement !== container) {
    // Only before a player exists — moving it later would reload it.
    if (!player) container.appendChild(host)
  }
}

function ensureHost(): HTMLDivElement {
  if (host) return host
  host = document.createElement("div")
  host.className = "yt-host"
  Object.assign(host.style, {
    position: hostContainer ? "absolute" : "fixed",
    left: "0", top: "0", width: "320px", height: "180px",
    visibility: "hidden", zIndex: "5", background: "#000",
  })
  const target = document.createElement("div")
  host.appendChild(target)
  ;(hostContainer ?? document.body).appendChild(host)
  return host
}

function syncHost() {
  rafId = 0
  if (!host) return
  const c = host.parentElement
  const s = slot
  const shown = !!(c && s && s.isConnected && (c === document.body || c.contains(s)) && s.getClientRects().length)
  if (shown) {
    const sr = s!.getBoundingClientRect()
    if (c === document.body) {
      Object.assign(host.style, { left: `${sr.left}px`, top: `${sr.top}px` })
    } else {
      const cr = c!.getBoundingClientRect()
      Object.assign(host.style, {
        left: `${sr.left - cr.left - c!.clientLeft + c!.scrollLeft}px`,
        top: `${sr.top - cr.top - c!.clientTop + c!.scrollTop}px`,
      })
    }
    Object.assign(host.style, { width: `${sr.width}px`, height: `${sr.height}px`, visibility: "visible" })
  } else {
    host.style.visibility = "hidden"
  }
  rafId = requestAnimationFrame(syncHost)
}

function startSync() {
  if (!rafId) rafId = requestAnimationFrame(syncHost)
}

function startPolling() {
  if (pollTimer) return
  pollTimer = setInterval(() => {
    if (player) handlers.onTime(player.getCurrentTime())
  }, 250)
}

function stopPolling() {
  if (pollTimer) clearInterval(pollTimer)
  pollTimer = null
}

/** Load `videoId` (if not already loaded) and play from `start` seconds. */
export async function ytLoadAndPlay(videoId: string, start: number) {
  ensureHost()
  startSync()
  if (player && currentId === videoId) {
    await playerReady
    player.seekTo(start, true)
    player.playVideo()
    return
  }
  if (player) {
    await playerReady
    currentId = videoId
    player.loadVideoById({ videoId, startSeconds: start })
    return
  }
  const YT = await preloadYouTubeApi()
  currentId = videoId
  let markReady: () => void = () => {}
  playerReady = new Promise((r) => { markReady = r })
  player = new YT.Player(host!.firstElementChild as HTMLElement, {
    host: "https://www.youtube-nocookie.com",
    videoId,
    width: "100%",
    height: "100%",
    playerVars: { start: Math.floor(start), autoplay: 1, playsinline: 1, rel: 0 },
    events: {
      onReady: () => {
        markReady()
        player!.seekTo(start, true)
        player!.playVideo()
      },
      onStateChange: (e: { data: number }) => {
        if (e.data === YT.PlayerState.PLAYING) startPolling()
        else stopPolling()
        if (e.data === YT.PlayerState.ENDED) handlers.onEnded()
      },
      onError: (e: { data: number }) => {
        stopPolling()
        handlers.onError(e.data)
      },
    },
  })
}

export function ytCurrentTime(): number | null {
  return player && currentId ? player.getCurrentTime() : null
}

export function ytPlay() {
  player?.playVideo()
}

export function ytPause() {
  player?.pauseVideo()
}

export function ytStop() {
  player?.pauseVideo()
  stopPolling()
  if (rafId) cancelAnimationFrame(rafId)
  rafId = 0
  if (host) host.style.visibility = "hidden"
}
