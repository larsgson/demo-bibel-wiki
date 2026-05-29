import { useState, useEffect } from "react"
import { useStore } from "@nanostores/react"
import { $selectedLanguage, $secondaryLanguages } from "../stores/language-store"
import { buildLangHref } from "../lib/bw/url-utils"
import type { ImageConfig } from "../lib/bw/types"
import { resolveImageUrl } from "../lib/bw/image-utils"

interface TemplateInfo {
  name: string
  image: string
  engTitle: string
  categoryCount: number
  storyCount: number
  localizedTitles: Record<string, string>
  imageConfig?: ImageConfig | null
}

interface Props {
  templates: TemplateInfo[]
}

const FALLBACK_IMAGES: Record<string, string> = {
  OBS: "/img/obs-icon.png",
}

export default function TemplateSelectorIsland({ templates }: Props) {
  const selectedLang = useStore($selectedLanguage)
  const secondaryLangs = useStore($secondaryLanguages)
  const [hydrated, setHydrated] = useState(false)
  useEffect(() => setHydrated(true), [])

  const getTitle = (t: TemplateInfo) =>
    hydrated ? (t.localizedTitles[selectedLang] || t.engTitle) : t.engTitle

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      {templates.map((t) => (
        <a
          key={t.name}
          href={hydrated ? buildLangHref(selectedLang, `${t.name}/`, secondaryLangs) : `/${t.name}/`}
          className="group block rounded-xl overflow-hidden border border-gray-200 dark:border-gray-700 hover:shadow-lg transition-shadow"
        >
          <div className="aspect-video bg-gray-100 dark:bg-gray-800 relative overflow-hidden">
            <img
              src={resolveImageUrl(t.image, t.imageConfig || null)}
              alt={getTitle(t)}
              className="w-full h-full object-cover group-hover:scale-105 transition-transform"
              onError={(e) => {
                ;(e.target as HTMLImageElement).src =
                  FALLBACK_IMAGES[t.name] || "/img/obs-icon.png"
              }}
            />
            <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/60 to-transparent p-4">
              <h2 className="text-white text-lg font-semibold">
                {getTitle(t)}
              </h2>
              <p className="text-white/80 text-sm">
                {t.categoryCount} categories, {t.storyCount} stories
              </p>
            </div>
          </div>
        </a>
      ))}
    </div>
  )
}
