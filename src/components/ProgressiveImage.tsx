import { useEffect, useState } from "react"

interface Props {
  /** Shown immediately — small, fast to load. */
  thumbSrc: string
  /** Preloaded in the background; swapped in once it's actually loaded,
   *  never before. Pass the same value as thumbSrc to skip upgrading. */
  fullSrc: string
  alt: string
  className?: string
  loading?: "eager" | "lazy"
  /** Tried if thumbSrc itself fails to load (e.g. no thumbs_pattern
   *  configured and resolveThumbUrl fell back to a non-existent path). */
  fallbackSrc?: string
  /** Called once every option (thumbnail, then fallbackSrc if given) has
   *  been tried and still failed — a genuinely broken/missing image, not
   *  just a slow one. Lets a caller swap in its own placeholder instead of
   *  leaving a permanently broken <img> on screen. */
  onError?: () => void
}

/**
 * Thumbnail-first, upgrade-in-the-background image. Renders the thumbnail
 * right away (cheap, fast), separately preloads the higher-resolution
 * version off-DOM at low priority, and only swaps `src` once that load has
 * actually completed — so a slow full-res fetch never blocks or delays
 * what's on screen, it just quietly replaces the thumbnail when ready.
 *
 * Each image upgrades independently (no page-wide "wait for everything"
 * gate) — simpler, and one slow/failed image never holds up the rest.
 */
export default function ProgressiveImage({
  thumbSrc,
  fullSrc,
  alt,
  className,
  loading = "lazy",
  fallbackSrc,
  onError,
}: Props) {
  const [src, setSrc] = useState(thumbSrc)
  const [thumbFailed, setThumbFailed] = useState(false)

  useEffect(() => {
    setSrc(thumbSrc)
    setThumbFailed(false)
  }, [thumbSrc])

  useEffect(() => {
    if (!fullSrc || fullSrc === thumbSrc) return
    let cancelled = false
    const img = new Image()
    // Not a visible DOM element — deprioritize relative to whatever's
    // still loading on screen (thumbnails included). Unsupported browsers
    // just ignore this property.
    ;(img as any).fetchPriority = "low"
    img.onload = () => {
      if (!cancelled) setSrc(fullSrc)
    }
    img.onerror = () => {
      // The upgrade target itself is missing/broken (confirmed live,
      // 2026-09-16: a medium/610px variant 404ing on the image CDN while
      // its thumbnail and full-size siblings both exist fine — an
      // isolated missing-file gap, not a code bug) — without this, the
      // image would silently stay stuck on the thumbnail forever with no
      // visible sign anything's wrong. Try the full-size original next,
      // if one was given and isn't just fullSrc itself.
      if (!cancelled && fallbackSrc && fallbackSrc !== fullSrc) {
        const retry = new Image()
        ;(retry as any).fetchPriority = "low"
        retry.onload = () => {
          if (!cancelled) setSrc(fallbackSrc)
        }
        retry.src = fallbackSrc
      }
    }
    img.src = fullSrc
    return () => {
      cancelled = true
    }
  }, [thumbSrc, fullSrc, fallbackSrc])

  return (
    <img
      src={src}
      alt={alt}
      className={className}
      loading={loading}
      onError={() => {
        if (!thumbFailed && fallbackSrc && src !== fallbackSrc) {
          setThumbFailed(true)
          setSrc(fallbackSrc)
        } else {
          // Nothing left to try — thumbnail failed, and either there's no
          // fallbackSrc or that failed too.
          onError?.()
        }
      }}
    />
  )
}
