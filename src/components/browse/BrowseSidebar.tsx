import { useState, useEffect } from "react"
import { useStore } from "@nanostores/react"
import { $apiConfigured } from "../../stores/api-store"
import { getAllTrees } from "../../lib/api/tree"
import type { TreeNode } from "../../lib/api/types"
import { SidebarNode } from "./SidebarNode"

interface RootEntry {
  id: string
  label: string
  children: TreeNode[]
}

interface Props {
  iso: string
  activeTree: string
  activePath: string[]
  onNavigate: (tree: string, path: string[]) => void
}

export function BrowseSidebar({ iso, activeTree, activePath, onNavigate }: Props) {
  const configured = useStore($apiConfigured)
  const [roots, setRoots] = useState<RootEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  useEffect(() => {
    if (!configured) {
      setLoading(false)
      return
    }
    getAllTrees()
      .then((resp) => {
        setRoots(
          Object.entries(resp.trees).map(([id, branch]) => ({
            id,
            label: branch.node.label ?? id,
            children: branch.children ?? [],
          }))
        )
        setLoading(false)
        if (activeTree) {
          setExpanded((prev) => new Set([...prev, activeTree]))
        }
      })
      .catch(() => setLoading(false))
  }, [configured])

  useEffect(() => {
    if (activeTree && !expanded.has(activeTree)) {
      setExpanded((prev) => new Set([...prev, activeTree]))
    }
  }, [activeTree])

  function toggleRoot(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  return (
    <div className="sidebar-inner">
      <h2 className="sidebar-title">Browse</h2>
      {loading ? (
        <p className="sidebar-loading">Loading…</p>
      ) : (
        <ul className="sidebar-roots">
          {roots.map((t) => {
            const isExpanded = expanded.has(t.id)
            const isActiveRoot = activeTree === t.id && activePath.length === 0
            return (
              <li key={t.id} className="root-node">
                <div className={`root-row ${isActiveRoot ? "active" : ""}`}>
                  <button
                    className="expand-btn"
                    type="button"
                    onClick={() => toggleRoot(t.id)}
                    aria-label={isExpanded ? "Collapse" : "Expand"}
                  >
                    <span className={`expand-arrow ${isExpanded ? "open" : ""}`}>›</span>
                  </button>
                  <a
                    className={`root-link ${activeTree === t.id ? "active-tree" : ""}`}
                    href={`/${iso}/browse/${t.id}`}
                    onClick={(e) => {
                      e.preventDefault()
                      onNavigate(t.id, [])
                    }}
                  >
                    {t.label}
                  </a>
                </div>

                {isExpanded && t.children.length > 0 && (
                  <ul className="root-children">
                    {t.children.map((child) => (
                      <SidebarNode
                        key={child.id}
                        tree={t.id}
                        nodeId={child.id}
                        label={child.label}
                        childCount={child.child_count}
                        initialChildren={child.children}
                        pathSegments={[child.id]}
                        iso={iso}
                        activePath={activeTree === t.id ? activePath : []}
                        activeTree={activeTree}
                        depth={1}
                        onNavigate={onNavigate}
                      />
                    ))}
                  </ul>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
