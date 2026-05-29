import { useState, useEffect } from "react"
import { getTreeNode } from "../../lib/api/tree"
import type { TreeName } from "../../lib/api/tree"
import type { TreeNode } from "../../lib/api/types"

interface Props {
  tree: string
  nodeId: string
  label: string
  childCount: number | undefined
  initialChildren?: TreeNode[]
  pathSegments: string[]
  iso: string
  activePath: string[]
  activeTree: string
  depth: number
  onNavigate: (tree: string, path: string[]) => void
}

export function SidebarNode({
  tree, nodeId, label, childCount, initialChildren,
  pathSegments, iso, activePath, activeTree, depth, onNavigate,
}: Props) {
  const [expanded, setExpanded] = useState(false)
  const [children, setChildren] = useState<TreeNode[] | null>(initialChildren ?? null)
  const [loading, setLoading] = useState(false)

  const hasChildren = childCount != null && childCount > 0

  const isActive =
    activeTree === tree &&
    activePath.length === pathSegments.length &&
    pathSegments.every((s, i) => activePath[i] === s)

  const isAncestor =
    activeTree === tree &&
    activePath.length > pathSegments.length &&
    pathSegments.every((s, i) => activePath[i] === s)

  useEffect(() => {
    if (isAncestor && !expanded && hasChildren) {
      setExpanded(true)
      if (!children && !initialChildren) loadChildren()
    }
  }, [isAncestor])

  function loadChildren() {
    if (loading || children !== null) return
    setLoading(true)
    getTreeNode(tree as TreeName, pathSegments)
      .then((branch) => {
        setChildren(branch.children ?? [])
        setLoading(false)
      })
      .catch(() => {
        setChildren([])
        setLoading(false)
      })
  }

  function toggle() {
    if (!hasChildren) return
    const next = !expanded
    setExpanded(next)
    if (next && !children) loadChildren()
  }

  return (
    <li className="node">
      <div
        className={`node-row ${isActive ? "active" : ""}`}
        style={{ paddingLeft: `${0.5 + depth * 0.75}rem` }}
      >
        {hasChildren ? (
          <button
            className="expand-btn"
            type="button"
            onClick={toggle}
            aria-label={expanded ? "Collapse" : "Expand"}
          >
            <span className={`expand-arrow ${expanded ? "open" : ""}`}>›</span>
          </button>
        ) : (
          <span className="expand-spacer" />
        )}
        <a
          className="node-link"
          href={`/${iso}/browse/${tree}/${pathSegments.join("/")}`}
          onClick={(e) => {
            e.preventDefault()
            onNavigate(tree, pathSegments)
          }}
        >
          {label}
        </a>
        {childCount != null && <span className="node-count">{childCount}</span>}
      </div>

      {expanded && hasChildren && (
        <ul className="node-children">
          {loading ? (
            <li className="node-loading">Loading…</li>
          ) : children && children.length > 0 ? (
            children.map((child) => (
              <SidebarNode
                key={child.id}
                tree={tree}
                nodeId={child.id}
                label={child.label}
                childCount={child.child_count}
                initialChildren={child.children}
                pathSegments={[...pathSegments, child.id]}
                iso={iso}
                activePath={activePath}
                activeTree={activeTree}
                depth={depth + 1}
                onNavigate={onNavigate}
              />
            ))
          ) : (
            <li className="node-empty">Empty</li>
          )}
        </ul>
      )}
    </li>
  )
}
