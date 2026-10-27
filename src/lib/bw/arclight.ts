/**
 * Playing a Jesus Film Project (Arclight) film in video-store's <video>
 * element: resolve `arclight:<film>/<language>` to its HLS stream through
 * the arclight-proxy function (the API sends no CORS headers), then play
 * it via a dynamically imported hls.js, or natively where hls.js can't
 * run (iPhone Safari).
 */

import { parseArclightUrl } from "./story-video"

const streamCache = new Map<string, Promise<string | null>>()

/** The HLS (or, failing that, mp4) URL of an `arclight:` video URL. */
export function resolveArclightStream(url: string): Promise<string | null> {
  const cached = streamCache.get(url)
  if (cached) return cached
  const ref = parseArclightUrl(url)
  if (!ref) return Promise.resolve(null)
  const q = new URLSearchParams({ media_component_id: ref.mediaComponentId, language_id: String(ref.languageId) })
  const p = fetch(`/.netlify/functions/arclight-proxy?${q}`)
    .then((r) => (r.ok ? r.json() : null))
    .then((d: { m3u8?: string | null; mp4?: string | null } | null) => d?.m3u8 ?? d?.mp4 ?? null)
    .catch(() => null)
  p.then((u) => { if (!u) streamCache.delete(url) })
  streamCache.set(url, p)
  return p
}

interface HlsLike {
  destroy(): void
}

let activeHls: HlsLike | null = null

/** Stop any hls.js instance attached by playStreamIn (before the <video>
 *  element gets another source). */
export function detachStream() {
  activeHls?.destroy()
  activeHls = null
}

/**
 * Load `streamUrl` into `video` and play from `start` seconds. Calls
 * `onError` once if the stream can't be played.
 */
export async function playStreamIn(video: HTMLVideoElement, streamUrl: string, start: number, onError: () => void) {
  detachStream()
  const startPlaying = () => {
    video.currentTime = start
    video.play().catch(() => {})
  }
  const playNatively = () => {
    video.addEventListener("loadedmetadata", startPlaying, { once: true })
    video.src = streamUrl
  }
  if (!/\.m3u8(\?|$)/.test(streamUrl)) return playNatively()
  try {
    // hls.js wherever it works (desktop Chrome reports native HLS support
    // now, but failed on these streams); native HLS only where hls.js
    // can't run (iPhone Safari).
    const mod = await import("hls.js")
    const Hls = (mod as { default: typeof import("hls.js").default }).default
    if (!Hls.isSupported()) {
      return video.canPlayType("application/vnd.apple.mpegurl") ? playNatively() : onError()
    }
    const hls = new Hls({ startPosition: start })
    activeHls = hls
    hls.on(Hls.Events.MANIFEST_PARSED, startPlaying)
    hls.on(Hls.Events.ERROR, (_e, data) => {
      if (data.fatal) {
        detachStream()
        onError()
      }
    })
    hls.loadSource(streamUrl)
    hls.attachMedia(video)
  } catch {
    onError()
  }
}
