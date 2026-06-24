import { useEffect, useRef } from "react"
import { useStore } from "@nanostores/react"
import { $activePane } from "../../stores/branch-view-store"
import { $navBranches } from "../../stores/nav-branches-store"
import type { BranchKey, SearchHit } from "../../lib/api/types"

const BRANCH_LABELS: Record<string, Record<string, string>> = {
  verses:      { en: "Verses",        es: "Versículos" },
  lexicon:     { en: "Lexicon",       es: "Léxico" },
  study:       { en: "Study Notes",   es: "Notas de estudio" },
  terms:       { en: "Key Terms",     es: "Términos clave" },
  morphology:  { en: "Morphology",    es: "Morfología" },
  methodology: { en: "Methodology",   es: "Metodología" },
  media:       { en: "Media",         es: "Recursos" },
  other:       { en: "Other",         es: "Otros" },
}

export function BranchContentPane({ lang = "es" }: { lang?: string }) {
  const pane = useStore($activePane)
  const navBranches = useStore($navBranches)
  const itemRefs = useRef<Map<number, HTMLElement>>(new Map())

  useEffect(() => {
    if (pane.pane === "branch" && pane.scrollToIndex != null) {
      const el = itemRefs.current.get(pane.scrollToIndex)
      if (el) el.scrollIntoView({ block: "start", behavior: "smooth" })
    }
  }, [pane])

  if (pane.pane !== "branch" || !pane.branchKey) return null

  const items = navBranches[pane.branchKey as BranchKey] ?? []
  if (items.length === 0) return null

  const label = BRANCH_LABELS[pane.branchKey]?.[lang] ?? pane.branchKey

  return (
    <div className="branch-content-pane">
      <div className="branch-content-header">
        <h2 className="branch-content-title">{label}</h2>
      </div>
      <div className="branch-content-list">
        {items.map((hit: SearchHit, idx: number) => (
          <article
            key={hit.chunk_id}
            className="branch-content-item"
            ref={(el) => { if (el) itemRefs.current.set(idx, el) }}
          >
            <h3 className="branch-content-item-title">
              {hit.passage || hit.title}
            </h3>
            {hit.passage && hit.title !== hit.passage && (
              <p className="branch-content-item-subtitle">{hit.title}</p>
            )}
            <p className="branch-content-item-text">{hit.excerpt}</p>
          </article>
        ))}
      </div>
    </div>
  )
}
