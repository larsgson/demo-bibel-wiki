import { useState, useEffect } from "react"
import { useStore } from "@nanostores/react"
import { $apiConfigured } from "../../stores/api-store"
import { getTreeRoot, getTreeNode } from "../../lib/api/tree"
import type { TreeName } from "../../lib/api/tree"
import type { TreeBranch } from "../../lib/api/types"

interface Props {
  tree: string
  path: string[]
  iso: string
}

export function TreeContent({ tree, path, iso }: Props) {
  const configured = useStore($apiConfigured)
  const [branch, setBranch] = useState<TreeBranch | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!tree) {
      setLoading(false)
      return
    }
    if (!configured) {
      setError("API not configured.")
      setLoading(false)
      return
    }

    setBranch(null)
    setLoading(true)
    setError(null)

    const promise =
      path.length > 0
        ? getTreeNode(tree as TreeName, path)
        : getTreeRoot(tree as TreeName)

    promise
      .then((data) => {
        setBranch(data)
        setLoading(false)
      })
      .catch((e: any) => {
        setError(
          e?.status === 404
            ? "Not found."
            : e?.detail || e?.message || "Failed to load."
        )
        setLoading(false)
      })
  }, [tree, path.join("/"), configured])

  if (loading) return <p className="tree-status">Loading…</p>
  if (error) return <p className="tree-status tree-error">{error}</p>
  if (!branch) return <p className="tree-status">No data.</p>

  function childHref(url: string): string {
    const parts = url.replace(/^\/(?:en|api)\/tree\//, "").split("/").filter(Boolean)
    if (parts.length >= 1) {
      const [t, ...rest] = parts
      const cleanPath = rest.map((s) => decodeURIComponent(s)).join("/")
      return `/${iso}/browse/${t}${cleanPath ? "/" + cleanPath : ""}`
    }
    return `/${iso}/browse/${url}`
  }

  return (
    <div className="tree-content">
      {(branch.node.label || branch.node.passage) && (
        <h1 className="tree-title">
          {branch.node.label ?? ""}
          {branch.node.passage && (
            <span className="tree-title-passage">{branch.node.passage}</span>
          )}
        </h1>
      )}

      {branch.node.section_heading && (
        <p className="tree-section-heading">{branch.node.section_heading}</p>
      )}

      {branch.children && branch.children.length > 0 && (
        <section className="tree-children">
          {branch.children.map((child) => (
            <a key={child.id} className="tree-child" href={childHref(child.url)}>
              <span className="tree-child-label">{child.label}</span>
              {child.child_count != null && (
                <span className="tree-child-count">{child.child_count}</span>
              )}
            </a>
          ))}
        </section>
      )}

      {branch.chunks && branch.chunks.length > 0 && (
        <section className="tree-chunks">
          <h3 className="tree-section-label">
            Resources ({branch.chunks.length})
          </h3>
          {branch.chunks.map((chunk) => (
            <a
              key={chunk.chunk_id}
              className="chunk-row"
              href={`/${iso}/c/${encodeURIComponent(chunk.chunk_id)}`}
            >
              <div className="chunk-row-top">
                <span className="chunk-row-title">{chunk.title}</span>
                <span className="chunk-row-kind">{chunk.kind}</span>
              </div>
              {chunk.passage && (
                <span className="chunk-row-passage">{chunk.passage}</span>
              )}
              <p className="chunk-row-excerpt">{chunk.excerpt}</p>
            </a>
          ))}
        </section>
      )}

      {(!branch.children || branch.children.length === 0) &&
        (!branch.chunks || branch.chunks.length === 0) && (
          <p className="tree-status">No content at this node.</p>
        )}
    </div>
  )
}
