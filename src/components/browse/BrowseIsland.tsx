import { useState } from "react"
import { BrowseSidebar } from "./BrowseSidebar"
import { TreeContent } from "./TreeContent"
import { getIsoFromUrl } from "../../lib/bw/iso-from-url"

interface Props {
  iso: string
  initialTree: string
  initialPath: string[]
}

export function BrowseIsland({ iso: isoProp, initialTree, initialPath }: Props) {
  const iso = isoProp || getIsoFromUrl()
  const [tree, setTree] = useState(initialTree)
  const [path, setPath] = useState(initialPath)
  const [sidebarOpen, setSidebarOpen] = useState(false)

  function navigate(newTree: string, newPath: string[]) {
    setTree(newTree)
    setPath(newPath)
    setSidebarOpen(false)
    const url = `/${iso}/browse/${newTree}${newPath.length ? "/" + newPath.join("/") : ""}`
    window.history.pushState({}, "", url)
  }

  return (
    <div className="browse-layout">
      <button
        className="sidebar-toggle"
        type="button"
        aria-label={sidebarOpen ? "Close menu" : "Open menu"}
        onClick={() => setSidebarOpen(!sidebarOpen)}
      >
        {sidebarOpen ? "✕" : "☰"}
        <span className="sidebar-toggle-label">Resources</span>
      </button>

      {sidebarOpen && (
        <button
          className="sidebar-backdrop"
          type="button"
          aria-label="Close menu"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <nav className={`sidebar ${sidebarOpen ? "open" : ""}`}>
        <BrowseSidebar
          iso={iso}
          activeTree={tree}
          activePath={path}
          onNavigate={navigate}
        />
      </nav>

      <div className="browse-content">
        {tree ? (
          <TreeContent tree={tree} path={path} iso={iso} />
        ) : (
          <div>
            <h1 className="browse-title">Browse resources</h1>
            <p className="browse-hint">
              Select a category from the sidebar to explore resources.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
