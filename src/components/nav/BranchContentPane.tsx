import { useEffect, useRef, useState, useCallback } from "react"
import type { BranchKey, SearchHit } from "../../lib/api/types"
import type { NavBranches } from "../../stores/nav-branches-store"

const NAV_BRANCHES_KEY = "nav_branches"

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

function loadBranches(): NavBranches {
  try {
    const raw = sessionStorage.getItem(NAV_BRANCHES_KEY)
    return raw ? JSON.parse(raw) : {}
  } catch {
    return {}
  }
}

export function BranchContentPane({ lang = "es" }: { lang?: string }) {
  const [branchKey, setBranchKey] = useState<string | null>(null)
  const [scrollIdx, setScrollIdx] = useState<number | null>(null)
  const [branches, setBranches] = useState<NavBranches>(loadBranches)
  const itemRefs = useRef<Map<number, HTMLElement>>(new Map())

  useEffect(() => {
    function onPaneChanged(e: Event) {
      const detail = (e as CustomEvent).detail
      if (detail?.pane === "branch" && detail.branchKey) {
        setBranches(loadBranches())
        setBranchKey(detail.branchKey)
        setScrollIdx(detail.scrollToIndex ?? null)
      } else {
        setBranchKey(null)
      }
    }
    function onBranchesChanged() {
      setBranches(loadBranches())
    }
    window.addEventListener("pane-changed", onPaneChanged)
    window.addEventListener("nav-branches-changed", onBranchesChanged)
    return () => {
      window.removeEventListener("pane-changed", onPaneChanged)
      window.removeEventListener("nav-branches-changed", onBranchesChanged)
    }
  }, [])

  useEffect(() => {
    if (branchKey && scrollIdx != null) {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          const el = itemRefs.current.get(scrollIdx)
          if (!el) return
          const top = el.getBoundingClientRect().top + window.scrollY - 80
          window.scrollTo({ top: Math.max(0, top), behavior: "smooth" })
        })
      })
    }
  }, [branchKey, scrollIdx])

  if (!branchKey) return null

  const items = (branches[branchKey as BranchKey] ?? []) as SearchHit[]
  if (items.length === 0) return null

  const label = BRANCH_LABELS[branchKey]?.[lang] ?? branchKey

  return (
    <div className="branch-content-pane">
      <div className="branch-content-header">
        <h2 className="branch-content-title">{label}</h2>
      </div>
      <div className="branch-content-list">
        {items.map((hit, idx) => (
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
