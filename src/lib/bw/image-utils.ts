import type { ImageConfig } from "./types"

/**
 * Apply path_pattern to a filename if configured.
 * Supports {filename} and {book} (first two chars of filename) placeholders.
 */
function applyPathPattern(filename: string, pattern: string): string {
  const book = filename.substring(0, 2)
  return pattern.replace("{book}", book).replace("{filename}", filename)
}

/**
 * Resolve a bare image filename to a full URL using the template's image config.
 * If the filename is already an absolute URL, return it as-is.
 */
export function resolveImageUrl(
  filename: string,
  imageConfig: ImageConfig | null,
): string {
  if (!filename) return filename
  if (filename.startsWith("http://") || filename.startsWith("https://")) return filename
  if (filename.startsWith("/")) return filename
  if (!imageConfig?.base_url) return filename

  const path = imageConfig.path_pattern
    ? applyPathPattern(filename, imageConfig.path_pattern)
    : filename
  return `${imageConfig.base_url}/${path}`
}

/**
 * Resolve a bare image filename to a thumbnail URL.
 * Uses thumbs_url if available, or falls back to the full-size URL.
 */
export function resolveThumbUrl(
  filename: string,
  imageConfig: ImageConfig | null,
  width = 360,
): string {
  if (!filename) return filename
  if (filename.startsWith("http://") || filename.startsWith("https://")) return filename
  if (filename.startsWith("/")) return filename
  if (!imageConfig) return filename

  if (imageConfig.thumbs_pattern) {
    const path = applyPathPattern(filename, imageConfig.thumbs_pattern)
    return `${imageConfig.base_url}/${path}`
  }

  if (imageConfig.thumbs_url) {
    const path = imageConfig.path_pattern
      ? applyPathPattern(filename, imageConfig.path_pattern)
      : filename
    return `${imageConfig.thumbs_url}/${path}`
  }

  // thumbs_resize = "netlify" means Netlify Image CDN handles resizing at the edge.
  // We just return the full-size URL here; Netlify's CDN config handles the rest.
  return resolveImageUrl(filename, imageConfig)
}

/**
 * Resolve a bare image filename to a medium-resolution URL.
 * Falls back to the full-size URL if no medium_pattern is configured.
 */
export function resolveMediumUrl(
  filename: string,
  imageConfig: ImageConfig | null,
  width = 800,
): string {
  if (!filename) return filename
  if (filename.startsWith("http://") || filename.startsWith("https://")) return filename
  if (filename.startsWith("/")) return filename

  if (imageConfig?.medium_pattern) {
    const path = applyPathPattern(filename, imageConfig.medium_pattern)
    return `${imageConfig.base_url}/${path}`
  }

  // Fall back to thumbs_url for medium if available (better than full 2160px)
  if (imageConfig?.thumbs_url) {
    const path = imageConfig.path_pattern
      ? applyPathPattern(filename, imageConfig.path_pattern)
      : filename
    return `${imageConfig.thumbs_url}/${path}`
  }

  return resolveImageUrl(filename, imageConfig)
}
