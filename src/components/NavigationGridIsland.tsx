import { useState, useEffect, useCallback } from "react"
import { useStore } from "@nanostores/react"
import { $selectedLanguage, $secondaryLanguages } from "../stores/language-store"
import { buildLangHref } from "../lib/bw/url-utils"
import type { TemplateStructure, LocaleData, ImageConfig } from "../lib/bw/types"
import { resolveThumbUrl } from "../lib/bw/image-utils"

interface Props {
  templateName: string
  structure: TemplateStructure
  engLocale: LocaleData | null
  allLocales: Record<string, LocaleData>
  defaultCategoryId?: string | null
  missingStoryIds?: string[]
  /** Map of "catId/storyId" → ["nt"] | ["ot"] | ["nt","ot"] */
  storyTestaments?: Record<string, string[]>
  imageConfig?: ImageConfig | null
}

/** Coverage status for a story given the selected language */
type CoverageStatus = "full" | "partial" | "none" | null

const FALLBACK_IMAGE = "/img/obs-icon.png"

export default function NavigationGridIsland({
  templateName,
  structure,
  engLocale,
  allLocales,
  defaultCategoryId = null,
  missingStoryIds = [],
  storyTestaments = {},
  imageConfig = null,
}: Props) {
  const selectedLang = useStore($selectedLanguage)
  const secondaryLangs = useStore($secondaryLanguages)
  const [hydrated, setHydrated] = useState(false)
  const [openCatId, setOpenCatId] = useState<string | null>(null)
  const [langCanons, setLangCanons] = useState<Record<string, Set<string>>>({})

  useEffect(() => setHydrated(true), [])

  // Fetch language canon coverage from compact data
  useEffect(() => {
    if (!hydrated) return
    fetch("/ALL-langs-compact.json")
      .then((r) => r.json())
      .then((data) => {
        const canons: Record<string, Set<string>> = {}
        if (data.canons) {
          for (const [canon, categories] of Object.entries(data.canons) as any[]) {
            if (canon === "books" || canon === "templates") continue
            for (const langEntries of Object.values(categories) as any[]) {
              for (const code of Object.keys(langEntries)) {
                if (!canons[code]) canons[code] = new Set()
                canons[code].add(canon)
              }
            }
          }
        }
        setLangCanons(canons)
      })
      .catch(() => {})
  }, [hydrated])

  // Auto-open the category: prefer defaultCategoryId prop, then last visited from localStorage, then first
  useEffect(() => {
    if (!hydrated) return

    if (defaultCategoryId) {
      setOpenCatId(defaultCategoryId)
      return
    }

    const storageKey = `lastCategory_${templateName.toLowerCase()}`
    let catToOpen = structure.categories[0]?.id || null

    try {
      const saved = localStorage.getItem(storageKey)
      if (saved && structure.categories.some((c) => c.id === saved)) {
        catToOpen = saved
      }
    } catch {
      /* localStorage unavailable */
    }

    setOpenCatId(catToOpen)
  }, [hydrated, templateName, structure.categories, defaultCategoryId])

  const localeData = hydrated ? (allLocales[selectedLang] || engLocale) : engLocale

  const getCategoryTitle = (catId: string) => {
    return localeData?.categories?.[catId]?.title || `Category ${catId}`
  }

  const getCategoryDesc = (catId: string) => {
    return localeData?.categories?.[catId]?.description || ""
  }

  const getStoryTitle = (catId: string, storyId: string) => {
    const key = `${catId}.${storyId}`
    return localeData?.stories?.[key]?.title || `Story ${storyId}`
  }

  const bookTitle = localeData?.bookTitle || engLocale?.bookTitle || templateName

  const toggleAccordion = useCallback((catId: string) => {
    setOpenCatId((prev) => {
      const newId = prev === catId ? null : catId
      if (newId) {
        try {
          localStorage.setItem(`lastCategory_${templateName.toLowerCase()}`, newId)
        } catch { /* localStorage unavailable */ }
      }
      return newId
    })
  }, [templateName])

  const getStoryHref = (catId: string, storyId: string) => {
    if (!hydrated) return `/${templateName}/${catId}/${storyId}`
    return buildLangHref(selectedLang, `${templateName}/${catId}/${storyId}`, secondaryLangs)
  }

  const missingSet = new Set(missingStoryIds)
  const isMissing = (catId: string, storyId: string) => missingSet.has(`${catId}/${storyId}`)

  const getCoverage = (catId: string, storyId: string): CoverageStatus => {
    if (!hydrated || Object.keys(langCanons).length === 0) return null
    const needed = storyTestaments[`${catId}/${storyId}`]
    if (!needed || needed.length === 0) return null
    const available = langCanons[selectedLang]
    if (!available) return "none"
    const covered = needed.filter((t) => available.has(t))
    if (covered.length === needed.length) return "full"
    if (covered.length > 0) return "partial"
    return "none"
  }

  const CoverageBadge = ({ catId, storyId }: { catId: string; storyId: string }) => {
    const status = getCoverage(catId, storyId)
    if (!status || status === "full") return null
    const color = status === "partial" ? "#ffc107" : "#dc3545"
    const label = status === "partial" ? "Partial text coverage" : "No text available"
    const icon = status === "partial" ? "◐" : "○"
    return (
      <div
        className="chapter-card-coverage"
        style={{ color }}
        title={label}
      >
        {icon}
      </div>
    )
  }

  return (
    <div className="chapter-picker">
      <div className="flex items-center gap-3 mb-4">
        <a href={hydrated ? buildLangHref(selectedLang, "", secondaryLangs) : "/"} className="text-lg font-bold" style={{ color: "var(--text)" }}>&larr;</a>
        <h1 className="chapter-picker-title" style={{ marginBottom: 0 }}>{bookTitle}</h1>
      </div>
      <div>
        {structure.categories.map((cat) => {
          const isOpen = openCatId === cat.id
          const rawThumb = cat.image || cat.stories[0]?.image || null
          const thumbSrc = rawThumb ? resolveThumbUrl(rawThumb, imageConfig) : null

          return (
            <div
              key={cat.id}
              className={`accordion-item${isOpen ? " open" : ""}`}
            >
              <button
                className="accordion-header"
                onClick={() => toggleAccordion(cat.id)}
              >
                {thumbSrc && (
                  <img
                    className="accordion-thumb"
                    src={thumbSrc}
                    alt=""
                    onError={(e) => {
                      ;(e.target as HTMLImageElement).style.display = "none"
                    }}
                  />
                )}
                <div className="accordion-info">
                  <span className="accordion-title">
                    {getCategoryTitle(cat.id)}
                  </span>
                  {getCategoryDesc(cat.id) && (
                    <span className="accordion-desc">
                      {getCategoryDesc(cat.id)}
                    </span>
                  )}
                </div>
                <span className="accordion-chevron">&#x25B8;</span>
              </button>
              <div className="accordion-body">
                <div className="accordion-body-inner">
                  <div className="chapter-grid">
                    {cat.stories.map((story) => {
                      const missing = isMissing(cat.id, story.id)
                      return (
                        <a
                          key={story.id}
                          href={missing ? undefined : getStoryHref(cat.id, story.id)}
                          className={`chapter-card${missing ? " chapter-card-missing" : ""}`}
                          title={missing ? "Content not yet available" : undefined}
                          onClick={missing ? (e: React.MouseEvent) => e.preventDefault() : undefined}
                        >
                          {(story.image || cat.image) ? (
                            <img
                              className="chapter-card-img"
                              src={resolveThumbUrl(story.image || cat.image, imageConfig)}
                              alt=""
                              loading="lazy"
                              onError={(e) => {
                                ;(e.target as HTMLImageElement).src = FALLBACK_IMAGE
                              }}
                            />
                          ) : (
                            <div
                              className="chapter-card-img"
                              style={{ background: "var(--bg-surface)" }}
                            />
                          )}
                          {missing && <div className="chapter-card-badge" title="Content not yet available">∅</div>}
                          {!missing && <CoverageBadge catId={cat.id} storyId={story.id} />}
                          <div className="chapter-card-info">
                            <span className="chapter-card-num">
                              {getStoryTitle(cat.id, story.id)}
                            </span>
                          </div>
                        </a>
                      )
                    })}
                  </div>
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
