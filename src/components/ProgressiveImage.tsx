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
    img.src = fullSrc
    return () => {
      cancelled = true
    }
  }, [thumbSrc, fullSrc])

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
        }
      }}
    />
  )
}
