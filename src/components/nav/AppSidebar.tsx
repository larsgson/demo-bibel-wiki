import { useState, useEffect, useRef, useCallback } from "react"
import { useStore } from "@nanostores/react"
import { $selectedIso, initIsoFromUrl } from "../../stores/iso-store"
import {
  $navBranches,
  $lastUpdatedBranches,
  initNavBranches,
  clearNavBranches,
} from "../../stores/nav-branches-store"
import type { BranchKey, SearchHit } from "../../lib/api/types"
import { $bibleHighlights } from "../../stores/bible-highlight-store"
import { clearBibleHighlights } from "../../stores/bible-highlight-store"
import { $activePane, showBible, showStory, showStudy, showBranch } from "../../stores/branch-view-store"

export interface SidebarTreeNode {
  id: string
  label: { en: string; es: string }
  href?: string
  children?: SidebarTreeNode[]
}

export interface BibleBookEntry {
  code: string
  name: string
  nameEs: string
  chapters: number
  ot: boolean
}

interface Props {
  iso?: string
  storyTree?: SidebarTreeNode[]
  bibleBooks?: BibleBookEntry[]
}

interface AnswerBranch {
  id: BranchKey
  icon: string
  label: { en: string; es: string }
}

const ANSWER_BRANCHES: AnswerBranch[] = [
  { id: "verses",      icon: "📜", label: { en: "Verses", es: "Versículos" } },
  { id: "lexicon",     icon: "🔤", label: { en: "Lexicon", es: "Léxico" } },
  { id: "terms",       icon: "🏷", label: { en: "Key terms", es: "Términos clave" } },
  { id: "study",       icon: "📝", label: { en: "Study notes", es: "Notas de estudio" } },
  { id: "morphology",  icon: "🔬", label: { en: "Morphology", es: "Morfología" } },
  { id: "methodology", icon: "🛠", label: { en: "Methodology", es: "Metodología" } },
  { id: "media",       icon: "🎬", label: { en: "Media", es: "Recursos" } },
  { id: "other",       icon: "•",  label: { en: "Other", es: "Otros" } },
]

const TOP_LEVEL_IDS = ["study_topic", "story", "bible"]

const UI = {
  en: { nav: "Navigation", close: "Close menu", ot: "Old Testament", nt: "New Testament", clearStudy: "Clear answers" },
  es: { nav: "Navegación", close: "Cerrar menú", ot: "Antiguo Testamento", nt: "Nuevo Testamento", clearStudy: "Borrar respuestas" },
}

const STORAGE_EXPANDED = "nav_expanded"
const STORAGE_LAST_LOCATION = "nav_last_location"
const BIBLE_POS_KEY = "bw-last-position"

function findAncestorIds(
  nodes: SidebarTreeNode[],
  isActive: (href: string) => boolean,
): string[] {
  const ids: string[] = []
  function walk(node: SidebarTreeNode): boolean {
    const selfActive = node.href ? isActive(node.href) : false
    let childActive = false
    if (node.children) {
      for (const child of node.children) {
        if (walk(child)) childActive = true
      }
    }
    if (selfActive || childActive) {
      ids.push(node.id)
      return true
    }
    return false
  }
  for (const n of nodes) walk(n)
  return ids
}

function loadBiblePosition(): { book: string; chapter: number } | null {
  try {
    const raw = localStorage.getItem(BIBLE_POS_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (typeof parsed?.book === "string" && typeof parsed?.chapter === "number") return parsed
  } catch {}
  return null
}

// Exclusive-open: keep only the clicked id and remove siblings at the same level.
// `siblings` lists the ids that are mutually exclusive with `id`.
function exclusiveOpen(prev: Set<string>, id: string, siblings: string[]): Set<string> {
  const next = new Set(prev)
  const wasOpen = next.has(id)
  for (const s of siblings) {
    if (s === id) continue
    next.delete(s)
    for (const v of prev) {
      if (v.startsWith(s + "/") || v.startsWith(s + "-")) next.delete(v)
    }
  }
  if (wasOpen) next.delete(id)
  else next.add(id)
  return next
}

export function AppSidebar({ iso: isoProp, storyTree, bibleBooks }: Props) {
  const storeIso = useStore($selectedIso)
  const navBranches = useStore($navBranches)
  const bibleHighlights = useStore($bibleHighlights)
  const activePane = useStore($activePane)
  useStore($lastUpdatedBranches) // subscribe so badge counts update

  const [isOpen, setIsOpen] = useState(false)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [pathname, setPathname] = useState("")
  const [activeBiblePos, setActiveBiblePos] = useState<{ book: string; chapter: number } | null>(null)
  const [localizedBookNames, setLocalizedBookNames] = useState<Map<string, string>>(new Map())
  const [availableBooks, setAvailableBooks] = useState<Set<string> | null>(null)
  const sidebarRef = useRef<HTMLElement>(null)
  const catalogFetchedForIso = useRef<string>("")

  const iso = isoProp || storeIso || "eng"
  const lang: "en" | "es" = iso === "eng" ? "en" : "es"
  const t = UI[lang]

  const fullHref = useCallback(
    (href: string) => `/${iso}${href}`,
    [iso],
  )

  const isActiveFull = useCallback(
    (fullPath: string) => {
      const target = fullPath.replace(/\/$/, "")
      const here = pathname.replace(/\/$/, "")
      return here === target || here.startsWith(target + "/")
    },
    [pathname],
  )

  // Fetch localized book names from the catalog JSON
  useEffect(() => {
    if (catalogFetchedForIso.current === iso) return
    catalogFetchedForIso.current = iso

    async function fetchCatalog() {
      try {
        let catalogUrl: string | null = null
        if (iso === "eng") {
          catalogUrl = "/bsb/catalog.json"
        } else {
          const infoRes = await fetch(`/pkf/${iso}/info.json`)
          if (!infoRes.ok) return
          const info = await infoRes.json()
          const pkf = info.assets?.find((a: any) => a.kind === "pkf")
          const cat = pkf ? info.assets?.find((a: any) => a.kind === "json" && a.base === pkf.base) : null
          if (cat) catalogUrl = `/pkf/${iso}/${cat.name}`
        }
        if (!catalogUrl) return
        const catRes = await fetch(catalogUrl)
        if (!catRes.ok) return
        const catalog = await catRes.json()
        const names = new Map<string, string>()
        const codes = new Set<string>()
        for (const doc of catalog.documents ?? []) {
          if (doc.bookCode) {
            codes.add(doc.bookCode)
            if (doc.h) names.set(doc.bookCode, doc.h)
          }
        }
        if (codes.size > 0) setAvailableBooks(codes)
        if (names.size > 0) setLocalizedBookNames(names)
      } catch {}
    }
    fetchCatalog()
  }, [iso])

  useEffect(() => {
    if (!isoProp) initIsoFromUrl()
    initNavBranches()

    const currentPath = window.location.pathname
    setPathname(currentPath)

    let restoredExpanded = new Set<string>()
    try {
      const raw = localStorage.getItem(STORAGE_EXPANDED)
      if (raw) restoredExpanded = new Set(JSON.parse(raw))
    } catch {}

    // Auto-expand story tree ancestors
    if (storyTree) {
      const templateIds = storyTree.map((n) => n.id)
      const segs = currentPath.split("/").filter(Boolean)
      const onStoryPage = segs.length >= 2 && templateIds.includes(segs[1])
      const activePath = onStoryPage ? currentPath : localStorage.getItem(STORAGE_LAST_LOCATION)

      if (activePath) {
        const isActive = (nodeHref: string) => {
          const pathSegs = activePath.split("/").filter(Boolean)
          const relPath = "/" + pathSegs.slice(1).join("/")
          const target = nodeHref.replace(/\/$/, "")
          const here = relPath.replace(/\/$/, "")
          return here === target || here.startsWith(target + "/")
        }
        const ancestors = findAncestorIds(storyTree, isActive)
        if (ancestors.length > 0) {
          restoredExpanded.add("story")
          for (const id of ancestors) restoredExpanded.add(id)
        }
      }

      if (onStoryPage) {
        localStorage.setItem(STORAGE_LAST_LOCATION, currentPath)
      }
    }

    // Auto-expand Bible tree to current position
    const biblePos = loadBiblePosition()
    if (biblePos && bibleBooks) {
      setActiveBiblePos(biblePos)
      const book = bibleBooks.find((b) => b.code === biblePos.book)
      if (book) {
        restoredExpanded.add("bible")
        restoredExpanded.add(book.ot ? "bible-ot" : "bible-nt")
        restoredExpanded.add(`bible-${book.code}`)
      }
    }

    setExpanded(restoredExpanded)

    requestAnimationFrame(() => {
      const active =
        sidebarRef.current?.querySelector(".app-sidebar-tree-item.active") ??
        sidebarRef.current?.querySelector(".app-sidebar-bible-ch.active")
      if (active) active.scrollIntoView({ block: "center", behavior: "instant" })
    })
  }, [])

  // Persist expanded set
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_EXPANDED, JSON.stringify([...expanded]))
    } catch {}
  }, [expanded])

  // Listen for chapter changes from the Reader (prev/next, book picker)
  useEffect(() => {
    const onPosChange = (e: Event) => {
      const { book, chapter } = (e as CustomEvent).detail
      setActiveBiblePos({ book, chapter })
      if (bibleBooks) {
        const entry = bibleBooks.find((b) => b.code === book)
        if (entry) {
          setExpanded((prev) => {
            const next = new Set(prev)
            next.add("bible")
            // Close sibling testament, open the correct one
            const testId = entry.ot ? "bible-ot" : "bible-nt"
            const otherTestId = entry.ot ? "bible-nt" : "bible-ot"
            next.delete(otherTestId)
            next.add(testId)
            // Close sibling books, open this one
            const booksInTest = bibleBooks.filter((b) => b.ot === entry.ot)
            for (const b of booksInTest) next.delete(`bible-${b.code}`)
            next.add(`bible-${book}`)
            return next
          })
        }
      }
      // Scroll active chapter into view
      requestAnimationFrame(() => {
        const active = sidebarRef.current?.querySelector(".app-sidebar-bible-ch.active")
        if (active) active.scrollIntoView({ block: "center", behavior: "smooth" })
      })
    }
    window.addEventListener("bible-position-changed", onPosChange)
    return () => window.removeEventListener("bible-position-changed", onPosChange)
  }, [bibleBooks])

  useEffect(() => {
    const onToggle = () => setIsOpen((v) => !v)
    window.addEventListener("toggle-sidebar", onToggle)
    return () => window.removeEventListener("toggle-sidebar", onToggle)
  }, [])

  useEffect(() => {
    document.body.classList.toggle("app-sidebar-open", isOpen)
    window.dispatchEvent(new CustomEvent("sidebar-state-changed", { detail: { isOpen } }))
  }, [isOpen])

  function toggleTopLevel(id: string) {
    setExpanded((prev) => exclusiveOpen(prev, id, TOP_LEVEL_IDS))
  }

  function hrefFor(route: string) {
    return route ? `/${iso}/${route}` : `/${iso}`
  }

  function isActivePath(href: string) {
    return isActiveFull(href)
  }

  function clearAllAnswers() {
    clearNavBranches()
    clearBibleHighlights()
    showStudy()
  }

  function navigateToBibleChapter(book: string, chapter: number) {
    const pos = { book, chapter }
    const verses = bibleHighlights.get(`${book}:${chapter}`) ?? []
    try { localStorage.setItem(BIBLE_POS_KEY, JSON.stringify(pos)) } catch {}
    setActiveBiblePos(pos)
    showBible()
    const readerPath = `/${iso}`
    const onReaderPage = pathname.replace(/\/$/, "") === readerPath
    if (onReaderPage) {
      window.dispatchEvent(new CustomEvent("navigate-to-chapter", { detail: { ...pos, highlightVerses: verses } }))
    } else {
      window.location.href = `${readerPath}/`
    }
  }

  // Count how many highlighted chapters a book has
  function bookHighlightCount(bookCode: string): number {
    let count = 0
    for (const key of bibleHighlights.keys()) {
      if (key.startsWith(bookCode + ":")) count++
    }
    return count
  }

  function bookDisplayName(book: BibleBookEntry): string {
    const localized = localizedBookNames.get(book.code)
    if (localized) return localized
    return lang === "es" ? book.nameEs : book.name
  }

  // --- Bible tree rendering ---

  function renderBibleChapters(book: BibleBookEntry) {
    const chapters = Array.from({ length: book.chapters }, (_, i) => i + 1)
    return (
      <div className="app-sidebar-bible-chapters">
        {chapters.map((ch) => {
          const active = activeBiblePos?.book === book.code && activeBiblePos?.chapter === ch
          const hasHighlight = bibleHighlights.has(`${book.code}:${ch}`)
          return (
            <button
              key={ch}
              type="button"
              className={`app-sidebar-bible-ch ${active ? "active" : ""} ${hasHighlight ? "highlighted" : ""}`}
              onClick={() => navigateToBibleChapter(book.code, ch)}
            >
              {ch}
            </button>
          )
        })}
      </div>
    )
  }

  function renderBibleBook(book: BibleBookEntry, allBooksInTestament: BibleBookEntry[]) {
    const nodeId = `bible-${book.code}`
    const bookOpen = expanded.has(nodeId)
    const isActiveBook = activeBiblePos?.book === book.code
    const siblingIds = allBooksInTestament.map((b) => `bible-${b.code}`)
    const hlCount = bookHighlightCount(book.code)

    return (
      <li key={book.code}>
        <button
          className={`app-sidebar-tree-row ${isActiveBook ? "active" : ""} ${hlCount > 0 ? "has-highlights" : ""}`}
          type="button"
          onClick={() => {
            setExpanded((prev) => exclusiveOpen(prev, nodeId, siblingIds))
            if (!bookOpen) navigateToBibleChapter(book.code, 1)
          }}
          style={{ paddingLeft: "1.7rem" }}
          aria-expanded={bookOpen}
        >
          <span className={`app-sidebar-arrow ${bookOpen ? "open" : ""}`}>›</span>
          <span className="app-sidebar-tree-label">{bookDisplayName(book)}</span>
          {hlCount > 0 ? (
            <span className="app-sidebar-highlight-badge">{hlCount}</span>
          ) : (
            <span className="app-sidebar-tree-count">{book.chapters}</span>
          )}
        </button>
        {bookOpen && renderBibleChapters(book)}
      </li>
    )
  }

  function renderBibleTestament(
    testamentId: string,
    label: string,
    booksList: BibleBookEntry[],
    siblingId: string,
  ) {
    const testOpen = expanded.has(testamentId)
    return (
      <li key={testamentId}>
        <button
          className="app-sidebar-tree-row"
          type="button"
          onClick={() => setExpanded((prev) => exclusiveOpen(prev, testamentId, [testamentId, siblingId]))}
          style={{ paddingLeft: "1rem" }}
          aria-expanded={testOpen}
        >
          <span className={`app-sidebar-arrow ${testOpen ? "open" : ""}`}>›</span>
          <span className="app-sidebar-tree-label">{label}</span>
          <span className="app-sidebar-tree-count">{booksList.length}</span>
        </button>
        {testOpen && (
          <ul className="app-sidebar-tree-children">
            {booksList.map((b) => renderBibleBook(b, booksList))}
          </ul>
        )}
      </li>
    )
  }

  // --- Story tree rendering ---

  function renderTreeNode(node: SidebarTreeNode, depth: number, siblingIds: string[]) {
    const hasChildren = node.children && node.children.length > 0
    const nodeOpen = expanded.has(node.id)
    const href = node.href ? fullHref(node.href) : undefined
    const active = href ? isActiveFull(href) : false
    const paddingLeft = `${1 + depth * 0.7}rem`

    if (!hasChildren && href) {
      return (
        <li key={node.id}>
          <a
            className={`app-sidebar-tree-item ${active ? "active" : ""}`}
            href={href}
            style={{ paddingLeft }}
          >
            {node.label[lang]}
          </a>
        </li>
      )
    }

    return (
      <li key={node.id}>
        <button
          className={`app-sidebar-tree-row ${active ? "active" : ""}`}
          type="button"
          onClick={() => {
            setExpanded((prev) => exclusiveOpen(prev, node.id, siblingIds))
            if (href && !nodeOpen) window.location.href = href
          }}
          style={{ paddingLeft }}
          aria-expanded={nodeOpen}
        >
          <span className={`app-sidebar-arrow ${nodeOpen ? "open" : ""}`}>›</span>
          <span className="app-sidebar-tree-label">{node.label[lang]}</span>
          {hasChildren && (
            <span className="app-sidebar-tree-count">{node.children!.length}</span>
          )}
        </button>
        {nodeOpen && hasChildren && (
          <ul className="app-sidebar-tree-children">
            {node.children!.map((child) =>
              renderTreeNode(child, depth + 1, node.children!.map((c) => c.id)),
            )}
          </ul>
        )}
      </li>
    )
  }

  function renderAnswerItems(items: SearchHit[], branchKey: string) {
    return (
      <ul className="app-sidebar-items">
        {items.map((hit, idx) => (
          <li key={hit.chunk_id}>
            <button
              className="app-sidebar-item"
              type="button"
              onClick={() => showBranch(branchKey, idx)}
            >
              <span className="app-sidebar-item-label">{hit.passage || hit.title}</span>
            </button>
          </li>
        ))}
      </ul>
    )
  }

  const hasAnyAnswers = ANSWER_BRANCHES.some((b) => (navBranches[b.id]?.length ?? 0) > 0)
  const answerBranchIds = ANSWER_BRANCHES.map((b) => b.id as string)

  const filteredBooks = bibleBooks?.filter((b) => !availableBooks || availableBooks.has(b.code)) ?? []
  const otBooks = filteredBooks.filter((b) => b.ot)
  const ntBooks = filteredBooks.filter((b) => !b.ot)

  const studyOpen = expanded.has("study_topic")
  const storyOpen = expanded.has("story")
  const bibleOpen = expanded.has("bible")

  return (
    <>
      {isOpen && (
        <button
          className="app-sidebar-backdrop"
          type="button"
          aria-label={t.close}
          onClick={() => setIsOpen(false)}
        />
      )}

      <aside ref={sidebarRef} className={`app-sidebar ${isOpen ? "open" : ""}`} aria-label={t.nav}>
        <div className="app-sidebar-header">
          <span className="app-sidebar-heading">{t.nav}</span>
          <button
            className="app-sidebar-close"
            type="button"
            aria-label={t.close}
            onClick={() => setIsOpen(false)}
          >
            ✕
          </button>
        </div>

        <nav className="app-sidebar-nav">
          <ul className="app-sidebar-roots">
            {/* ── Stories ── */}
            {storyTree && storyTree.length > 0 && (
              <li className="app-sidebar-root">
                <button
                  className={`app-sidebar-root-row toggle ${activePane.pane === "story" ? "active" : ""}`}
                  type="button"
                  onClick={() => {
                    toggleTopLevel("story")
                    showStory()
                  }}
                  aria-expanded={storyOpen}
                >
                  <span className={`app-sidebar-arrow ${storyOpen ? "open" : ""}`}>›</span>
                  <span className="app-sidebar-icon">📚</span>
                  <span className="app-sidebar-root-label">{lang === "es" ? "Historias" : "Stories"}</span>
                </button>
                {storyOpen && (
                  <ul className="app-sidebar-tree-children">
                    {storyTree.map((tpl) =>
                      renderTreeNode(tpl, 0, storyTree.map((t) => t.id)),
                    )}
                  </ul>
                )}
              </li>
            )}

            {/* ── Bible ── */}
            {bibleBooks && bibleBooks.length > 0 && (
              <li className="app-sidebar-root">
                <button
                  className={`app-sidebar-root-row toggle ${activePane.pane === "bible" ? "active" : ""}`}
                  type="button"
                  onClick={() => {
                    toggleTopLevel("bible")
                    showBible()
                  }}
                  aria-expanded={bibleOpen}
                >
                  <span className={`app-sidebar-arrow ${bibleOpen ? "open" : ""}`}>›</span>
                  <span className="app-sidebar-icon">📖</span>
                  <span className="app-sidebar-root-label">{lang === "es" ? "Biblia" : "Bible"}</span>
                </button>
                {bibleOpen && (
                  <ul className="app-sidebar-tree-children">
                    {otBooks.length > 0 && renderBibleTestament("bible-ot", t.ot, otBooks, "bible-nt")}
                    {ntBooks.length > 0 && renderBibleTestament("bible-nt", t.nt, ntBooks, "bible-ot")}
                  </ul>
                )}
              </li>
            )}

            {/* ── Study topic ── */}
            <li className="app-sidebar-root">
              <button
                className={`app-sidebar-root-row toggle ${activePane.pane === "study" || activePane.pane === "branch" ? "active" : ""}`}
                type="button"
                onClick={() => {
                  toggleTopLevel("study_topic")
                  showStudy()
                }}
                aria-expanded={studyOpen}
              >
                <span className={`app-sidebar-arrow ${studyOpen ? "open" : ""}`}>›</span>
                <span className="app-sidebar-icon">💬</span>
                <span className="app-sidebar-root-label">{lang === "es" ? "Estudiar un tema" : "Study a topic"}</span>
              </button>
              {studyOpen && (
                <>
                  <ul className="app-sidebar-tree-children">
                    {ANSWER_BRANCHES.map((branch) => {
                      const items = navBranches[branch.id] ?? []
                      if (items.length === 0) return null
                      const branchOpen = expanded.has(branch.id)
                      const isActiveBranch = activePane.pane === "branch" && activePane.branchKey === branch.id
                      return (
                        <li key={branch.id}>
                          <button
                            className={`app-sidebar-tree-row ${isActiveBranch ? "active" : ""}`}
                            type="button"
                            onClick={() => {
                              setExpanded((prev) => exclusiveOpen(prev, branch.id, answerBranchIds))
                              showBranch(branch.id)
                            }}
                            style={{ paddingLeft: "1.7rem" }}
                            aria-expanded={branchOpen}
                          >
                            <span className={`app-sidebar-arrow ${branchOpen ? "open" : ""}`}>›</span>
                            <span className="app-sidebar-icon" style={{ fontSize: "0.8rem" }}>{branch.icon}</span>
                            <span className="app-sidebar-tree-label">{branch.label[lang]}</span>
                            <span className="app-sidebar-badge">{items.length}</span>
                          </button>
                          {branchOpen && renderAnswerItems(items, branch.id)}
                        </li>
                      )
                    })}
                  </ul>
                  {hasAnyAnswers && (
                    <button
                      className="app-sidebar-clear-btn"
                      type="button"
                      onClick={clearAllAnswers}
                    >
                      {t.clearStudy}
                    </button>
                  )}
                </>
              )}
            </li>
          </ul>
        </nav>
      </aside>
    </>
  )
}
