import { useEffect, useRef, useState } from "react"
import type { SearchHit } from "../../lib/api/types"
import type { NavBranches } from "../../stores/nav-branches-store"
import { apiFetch } from "../../stores/api-store"
import { $activePane } from "../../stores/branch-view-store"
import { t as translate } from "../../lib/bw/ui-locales"

const NAV_BRANCHES_KEY = "nav_branches"

/** Localised label for an answer-branch kind (labels live in the locale files
 *  under `branches.*`). Falls back to the raw key for unknown kinds. */
function branchLabel(branchKey: string, lang: string): string {
  const key = branchKey === "cross-ref" ? "crossRef" : branchKey
  const resolved = translate(lang, `branches.${key}`)
  return resolved.startsWith("branches.") ? branchKey : resolved
}

function loadBranches(): NavBranches {
  try {
    const raw = sessionStorage.getItem(NAV_BRANCHES_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (Array.isArray(parsed)) return parsed as NavBranches
    return []
  } catch {
    return []
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

  const excerpt = hit.excerpt ?? (hit as any).headline ?? ""
  const isTruncated = excerpt.endsWith("…") || excerpt.endsWith("...")

  async function expand() {
    if (expanded) {
      setExpanded(false)
      return
    }
    if (fullBody) {
      setExpanded(true)
      return
    }
    if (!hit.chunk_id) return
    setLoading(true)
    try {
      const data = await apiFetch<ChunkResponse>(
        `/api/chunk/${hit.chunk_id}`
      )
      setFullBody(data.body)
      setExpanded(true)
    } catch {
      setFullBody(excerpt)
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
        {hit.passage || hit.title || (hit as any).headline || "—"}
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
      ) : excerpt ? (
        <p className="branch-content-item-text">
          <span dangerouslySetInnerHTML={{ __html: renderMarkdown(excerpt) }} />
          {isTruncated && (
            <button className="branch-content-expand" onClick={expand} type="button">
              {loading ? "..." : "…"}
            </button>
          )}
        </p>
      ) : null}
    </article>
  )
}

export function BranchContentPane({ lang = "es" }: { lang?: string }) {
  const [branchKey, setBranchKey] = useState<string | null>(null)
  const [queryIndex, setQueryIndex] = useState<number | undefined>(undefined)
  const [scrollIdx, setScrollIdx] = useState<number | null>(null)
  const [branches, setBranches] = useState<NavBranches>(loadBranches)
  const itemRefs = useRef<Map<number, HTMLElement>>(new Map())

  useEffect(() => {
    const init = $activePane.get()
    if (init.pane === "branch" && init.branchKey) {
      setBranches(loadBranches())
      setBranchKey(init.branchKey)
      setQueryIndex(init.queryIndex)
      setScrollIdx(init.scrollToIndex ?? null)
    }
    function onPaneChanged(e: Event) {
      const detail = (e as CustomEvent).detail
      if (detail?.pane === "branch" && detail.branchKey) {
        setBranches(loadBranches())
        setBranchKey(detail.branchKey)
        setQueryIndex(detail.queryIndex)
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

  let items: SearchHit[] = []
  if (queryIndex != null && branches[queryIndex]) {
    items = (branches[queryIndex].branches[branchKey] ?? []) as SearchHit[]
  } else {
    for (const entry of branches) {
      const found = entry.branches[branchKey]
      if (found?.length) { items = found as SearchHit[]; break }
    }
  }
  if (items.length === 0) return null

  const label = branchLabel(branchKey, lang)

  return (
    <div className="branch-content-pane">
      <div className="branch-content-header">
        <h2 className="branch-content-title">{label}</h2>
      </div>
      <div className="branch-content-list">
        {items.map((hit, idx) => (
          <ExpandableItem
            key={hit.chunk_id || idx}
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
