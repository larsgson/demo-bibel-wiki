import type { Section, ImageConfig } from "../lib/bw/types"
import { resolveImageUrl, resolveMediumUrl } from "../lib/bw/image-utils"

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
}: Props) {
  const primaryLang = selectedLanguages[0]
  const primarySection = sectionsMap[primaryLang]?.[sectionIndex]
  if (!primarySection) return null

  const hasReference = !!primarySection.reference || !!isVideoSection?.(sectionIndex)
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
      {/* Images + verse ref */}
      {primarySection.imageUrls.length > 0 && (
        <div className="listen-verse-images">
          {primarySection.imageUrls.map((url, imgIdx) => (
            <img
              key={imgIdx}
              src={resolveMediumUrl(url, imageConfig, 800)}
              alt={`Section ${sectionIndex + 1}`}
              className="w-full aspect-video object-cover"
              loading={sectionIndex < 3 ? "eager" : "lazy"}
              onError={(e) => {
                const img = e.target as HTMLImageElement
                const fullUrl = resolveImageUrl(url, imageConfig)
                if (img.src !== fullUrl) img.src = fullUrl
              }}
            />
          ))}
          {primarySection.reference && (
            <div className="listen-verse-ref">{primarySection.reference}</div>
          )}
        </div>
      )}

      {/* No-image verse ref fallback */}
      {primarySection.imageUrls.length === 0 && primarySection.reference && (
        <div className="listen-verse-ref-inline">{primarySection.reference}</div>
      )}

      {/* Section heading (no-image case only) */}
      {primarySection.imageUrls.length === 0 && primarySection.heading && (
        <div className="px-3 pt-3">
          <h3 className="text-base font-semibold text-gray-800 dark:text-gray-200">
            {primarySection.heading}
          </h3>
        </div>
      )}

      {/* Multi-language text */}
      {selectedLanguages.map((langCode, langIndex) => {
        const langSection = sectionsMap[langCode]?.[sectionIndex]
        if (!langSection?.text?.trim()) return null

        const isRTL = RTL_LANGUAGES.includes(langCode)
        const isPrimary = langIndex === 0
        const hasImages = primarySection.imageUrls.length > 0
        const textClass = isPrimary
          ? `listen-verse-text-primary${hasImages ? " has-images" : ""}`
          : `listen-verse-text-secondary${hasImages ? " has-images" : ""}`

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
            {langSection.text.split("\n").map((line, i) => {
              const trimmed = line.trim()
              if (!trimmed) return null
              return (
                <p key={i} className="mb-1">
                  {trimmed}
                </p>
              )
            })}
          </div>
        )
      })}
    </div>
  )
}
