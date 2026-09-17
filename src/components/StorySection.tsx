import { useState } from "react"
import type { Section, ImageConfig } from "../lib/bw/types"
import { resolveImageUrl, resolveMediumUrl, resolveThumbUrl } from "../lib/bw/image-utils"
import ProgressiveImage from "./ProgressiveImage"
// Side-effect import: brings in the .reader-body/.verse-block/.v etc
// classes renderSofria's HTML output uses (see reference-html.ts) — the
// same stylesheet Reader.svelte itself loads. Its own --TextColor/etc
// variables are bridged to this app's --text/--bg family for
// .listen-verse-reader-excerpt specifically — see global.css.
import "../lib/reader/reader.css"

interface Props {
  section: Section
  sectionIndex: number
  selectedLanguages: string[]
  sectionsMap: Record<string, Section[]>
  onSectionClick: (index: number) => void
  imageConfig?: ImageConfig | null
  /** Video-driven templates (see the "test" template) have no Bible-verse
   *  reference to gate clickability on — this reports playable section
   *  indices instead. When absent, clickability is unchanged (reference-only). */
  isVideoSection?: (index: number) => boolean
  /** Bible-reader-identical HTML (verse numbers, paragraph/poetry
   *  structure) for image-less, reference-only sections — lang ->
   *  reference string -> html; see reference-html.ts. Falls back to the
   *  flattened text below when a (lang, reference) pair has no entry yet. */
  referenceHtml?: Record<string, Record<string, string>>
}

const RTL_LANGUAGES = ["heb", "arb", "ara"]

export default function StorySection({
  section,
  sectionIndex,
  selectedLanguages,
  sectionsMap,
  onSectionClick,
  imageConfig = null,
  isVideoSection,
  referenceHtml,
}: Props) {
  const primaryLang = selectedLanguages[0]
  const primarySection = sectionsMap[primaryLang]?.[sectionIndex]
  // Every image this section has (thumbnail AND fallback, see
  // ProgressiveImage) that has genuinely failed to load — not just slow.
  // Once ALL of them have, this is treated exactly like an image-less
  // section (same fallback backdrop, same reader-style text) rather than
  // leaving a permanently broken picture on screen.
  const [failedImageCount, setFailedImageCount] = useState(0)
  if (!primarySection) return null

  const hasReference = !!primarySection.reference || !!isVideoSection?.(sectionIndex)
  const totalImages = primarySection.imageUrls.length
  const hasWorkingImages = totalImages > 0 && failedImageCount < totalImages
  // Distinguishes WHY there's no working image, for the blue placeholder
  // below: a genuinely image-less section only needs it while an audio
  // player is actually showing the section (see BaseLayout.astro's
  // populateFocusPanel, and the mini player which only ever renders while
  // playing at all) — no need to clutter normal browsing with a colored
  // box a section was never going to have a picture for. A section whose
  // image failed to load, though, should show it always — that's a
  // broken/degraded state worth surfacing regardless of play state.
  const imageLoadFailed = totalImages > 0 && !hasWorkingImages
  return (
    <div
      id={`verse-${sectionIndex}`}
      data-verse-idx={sectionIndex}
      {...(hasReference ? { "data-clickable": "1" } : {})}
      className={`listen-verse-card rounded-lg overflow-hidden border ${
        hasReference ? "cursor-pointer hover:shadow-md" : ""
      }`}
      {...(hasReference ? {
        onClick: () => onSectionClick(sectionIndex),
        role: "button",
        tabIndex: 0,
        onKeyDown: (e: React.KeyboardEvent) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault()
            onSectionClick(sectionIndex)
          }
        },
      } : {})}
    >
      {/* Images + verse ref — kept mounted (not unmounted) even once every
          image has failed, so a later successful retry (e.g. connectivity
          coming back) can still recover; it's just visually hidden behind
          the fallback backdrop below via CSS, not removed from the DOM. */}
      {totalImages > 0 && (
        <div className="listen-verse-images" style={hasWorkingImages ? undefined : { display: "none" }}>
          {primarySection.imageUrls.map((url, imgIdx) => (
            <ProgressiveImage
              key={imgIdx}
              thumbSrc={resolveThumbUrl(url, imageConfig, 360)}
              fullSrc={resolveMediumUrl(url, imageConfig, 800)}
              fallbackSrc={resolveImageUrl(url, imageConfig)}
              alt={`Section ${sectionIndex + 1}`}
              className="w-full aspect-video object-cover"
              loading={sectionIndex < 3 ? "eager" : "lazy"}
              onError={() => setFailedImageCount((n) => n + 1)}
            />
          ))}
          {primarySection.reference && (
            <div className="listen-verse-ref">{primarySection.reference}</div>
          )}
        </div>
      )}

      {/* No-image fallback (genuinely no image, OR every image failed to
          load — same treatment either way): the focus/mini audio players
          normally overlay their play/pause/stop controls on the section's
          photo — with no photo there's nothing for them to sit on (and,
          for the mini player, its controls are literally white-on-white
          against the page background). A themed placeholder area gives
          both players the same "photo-like" backdrop they expect; only
          rendered when the section is actually playable, since a
          non-audio text-only section has no controls to backdrop at all.
          Also gives the cloned focus panel a fixed-size anchor so its
          centered controls don't end up lost partway down a long excerpt
          — see BaseLayout.astro's populateFocusPanel. */}
      {!hasWorkingImages && hasReference && (
        <div
          className={`listen-verse-images listen-verse-noimage-fallback${
            imageLoadFailed ? "" : " listen-verse-noimage-fallback--empty"
          }`}
        />
      )}

      {/* No-image verse ref fallback */}
      {!hasWorkingImages && primarySection.reference && (
        <div className="listen-verse-ref-inline">{primarySection.reference}</div>
      )}

      {/* Section heading (no-image case only) — styled like the Bible
          reader's own section headings (reader.css's h3.s) rather than the
          caption look, since there's no image for it to overlay. */}
      {!hasWorkingImages && primarySection.heading && (
        <div className="px-3 pt-3">
          <h3 className="listen-verse-heading-plain">{primarySection.heading}</h3>
        </div>
      )}

      {/* Multi-language text */}
      {selectedLanguages.map((langCode, langIndex) => {
        const langSection = sectionsMap[langCode]?.[sectionIndex]
        const hasImages = hasWorkingImages
        // Image-less, reference-only sections get the actual Bible-reader
        // rendering (verse numbers, paragraph/poetry structure) when it's
        // resolved — keyed off the section's own (untranslated) reference
        // string, same for every language. Falls back to the flattened
        // text below until it resolves (or if it never does).
        const html = !hasImages && primarySection.reference
          ? referenceHtml?.[langCode]?.[primarySection.reference]
          : undefined

        if (!html && !langSection?.text?.trim()) return null

        const isRTL = RTL_LANGUAGES.includes(langCode)
        const isPrimary = langIndex === 0
        // Image-backed sections keep the caption-overlay look; image-less
        // sections instead get "reader-style" typography — the same plain,
        // book-like paragraph treatment used in the main Bible reader
        // (reader.css), since there's no picture for the caption effect to
        // play against. Superseded by the real HTML embed below once it
        // resolves, but still the fallback while it's loading.
        const textClass = isPrimary
          ? `listen-verse-text-primary${hasImages ? " has-images" : " reader-style"}`
          : `listen-verse-text-secondary${hasImages ? " has-images" : " reader-style"}`

        return (
          <div key={langCode} className={textClass} dir={isRTL ? "rtl" : "ltr"}>
            {/* Heading inside primary text block so it participates in the overlap */}
            {isPrimary && hasImages && primarySection.heading && (
              <h3 className="text-base font-semibold mb-1">
                {primarySection.heading}
              </h3>
            )}
            {!isPrimary && (
              <span className="text-xs text-gray-400 uppercase">{langCode}</span>
            )}
            {html ? (
              <div
                className="reader-body listen-verse-reader-excerpt"
                dangerouslySetInnerHTML={{ __html: html }}
              />
            ) : (
              langSection!.text.split("\n").map((line, i) => {
                const trimmed = line.trim()
                if (!trimmed) return null
                // Reader-style paragraphs use CSS padding-top + text-indent
                // (book-like, matching reader.css's p.p) instead of the
                // caption style's compact margin-bottom spacing.
                return (
                  <p key={i} className={hasImages ? "mb-1" : undefined}>
                    {trimmed}
                  </p>
                )
              })
            )}
          </div>
        )
      })}
    </div>
  )
}
