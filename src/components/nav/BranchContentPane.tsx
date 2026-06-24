import { useEffect, useRef, useState } from "react"
import type { BranchKey, SearchHit } from "../../lib/api/types"
import type { NavBranches } from "../../stores/nav-branches-store"
import { apiFetch } from "../../stores/api-store"

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

function renderMarkdown(md: string) {
  return md
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    .replace(/_(.+?)_/g, "<em>$1</em>")
    .replace(/\n\n/g, "</p><p>")
    .replace(/\n/g, "<br>")
}

interface ChunkResponse {
  chunk_id: string
  body: string
  title: string
  passage: string | null
}

function ExpandableItem({
  hit,
  idx,
  itemRef,
  autoExpand,
}: {
  hit: SearchHit
  idx: number
  itemRef: (el: HTMLElement | null) => void
  autoExpand: boolean
}) {
  const [expanded, setExpanded] = useState(false)
  const [fullBody, setFullBody] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function expand() {
    if (expanded) {
      setExpanded(false)
      return
    }
    if (fullBody) {
      setExpanded(true)
      return
    }
    setLoading(true)
    try {
      const data = await apiFetch<ChunkResponse>(
        `/api/chunk/${hit.chunk_id}`
      )
      setFullBody(data.body)
      setExpanded(true)
    } catch {
      setFullBody(hit.excerpt)
      setExpanded(true)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (autoExpand && !expanded && !fullBody) {
      expand()
    }
  }, [autoExpand])

  const isTruncated = hit.excerpt.endsWith("…") || hit.excerpt.endsWith("...")

  return (
    <article
      key={hit.chunk_id}
      className={`branch-content-item ${expanded ? "expanded" : ""}`}
      ref={itemRef}
    >
      <h3
        className="branch-content-item-title clickable"
        onClick={expand}
      >
        {hit.passage || hit.title}
        {loading && <span className="branch-content-loading"> ...</span>}
      </h3>
      {hit.passage && hit.title !== hit.passage && (
        <p className="branch-content-item-subtitle">{hit.title}</p>
      )}
      {expanded && fullBody ? (
        <div
          className="branch-content-item-body"
          dangerouslySetInnerHTML={{ __html: renderMarkdown(fullBody) }}
        />
      ) : (
        <p className="branch-content-item-text">
          <span dangerouslySetInnerHTML={{ __html: renderMarkdown(hit.excerpt) }} />
          {isTruncated && (
            <button className="branch-content-expand" onClick={expand} type="button">
              {loading ? "..." : "…"}
            </button>
          )}
        </p>
      )}
    </article>
  )
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
          <ExpandableItem
            key={hit.chunk_id}
            hit={hit}
            idx={idx}
            itemRef={(el) => { if (el) itemRefs.current.set(idx, el) }}
            autoExpand={idx === scrollIdx}
          />
        ))}
      </div>
    </div>
  )
}
