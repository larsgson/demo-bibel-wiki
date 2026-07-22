import { useState, useEffect, useRef, useCallback } from "react"
import { useStore } from "@nanostores/react"
import { $selectedIso, initIsoFromUrl } from "../../stores/iso-store"
import {
  $navBranches,
  $lastUpdatedBranches,
  initNavBranches,
  clearNavBranches,
  type NavBranches,
  type LastUpdate,
} from "../../stores/nav-branches-store"
import type { BranchKey, SearchHit } from "../../lib/api/types"
import { $bibleHighlights } from "../../stores/bible-highlight-store"
import { clearBibleHighlights } from "../../stores/bible-highlight-store"
import { $activePane, showBible, showStory, showStudy, showBranch } from "../../stores/branch-view-store"
import { getUILevel, type UILevel } from "../../stores/ui-level-store"
import { shouldProbePkf } from "../../lib/bw/language-list"
import { pkfUrl } from "../../lib/bw/pkf-url"
import { loadBookList } from "../../lib/bw/book-list"
import { fetchHelloaoCatalog } from "../../lib/reader/helloaoCatalog"
import { t as translate } from "../../lib/bw/ui-locales"
import { uiLangForRegion } from "../../lib/data/region-config"
import { $activeRegion } from "../../stores/region-store"
import { shareCurrentPage } from "../../lib/bw/share"
import { currentBookmarkKey, isBookmarked } from "../../lib/bw/bookmarks"
import { loadVernacularNav, vernacularLabel, type VernacularStrings } from "../../lib/bw/vernacular-ui"

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

// Icon + locale key (under `branches.*`) per answer-branch kind. Labels live in
// the locale files, not here.
const BRANCH_META: Record<string, { icon: string; key: string }> = {
  verses:      { icon: "📜", key: "verses" },
  lexicon:     { icon: "🔤", key: "lexicon" },
  terms:       { icon: "🏷", key: "terms" },
  study:       { icon: "📝", key: "study" },
  morphology:  { icon: "🔬", key: "morphology" },
  methodology: { icon: "🛠", key: "methodology" },
  media:       { icon: "🎬", key: "media" },
  passage:     { icon: "📖", key: "passage" },
  concept:     { icon: "💡", key: "concept" },
  entity:      { icon: "👤", key: "entity" },
  speaker:     { icon: "🗣", key: "speaker" },
  "cross-ref": { icon: "🔗", key: "crossRef" },
  other:       { icon: "•",  key: "other" },
}

const TOP_LEVEL_IDS = ["study_topic", "story", "bible"]

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
      if (typeof v === "string" && (v.startsWith(s + "/") || v.startsWith(s + "-"))) next.delete(v)
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
  const lastUpdated = useStore($lastUpdatedBranches)

  const [isOpen, setIsOpen] = useState(false)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [pathname, setPathname] = useState("")
  const [uiLevel, setUiLevel] = useState<UILevel>(1)

  // Track UI level (Simple/Standard/Study) from the gear toggle. Listen to the
  // window event because each island has its own store instance.
  useEffect(() => {
    setUiLevel(getUILevel())
    const onChange = (e: Event) => {
      const level = (e as CustomEvent).detail as UILevel
      setUiLevel(level)
      // Jump to the level's default landing for immediate feedback:
      // Simple → stories, Standard/Study → Bible.
      if (level === 1) showStory()
      else showBible()
    }
    window.addEventListener("ui-level-changed", onChange)
    return () => window.removeEventListener("ui-level-changed", onChange)
  }, [])
  const [activeBiblePos, setActiveBiblePos] = useState<{ book: string; chapter: number } | null>(null)
  const [localizedBookNames, setLocalizedBookNames] = useState<Map<string, string>>(new Map())
  const [availableBooks, setAvailableBooks] = useState<Set<string> | null>(null)
  const [shared, setShared] = useState(false)
  const [currentBookmarked, setCurrentBookmarked] = useState(false)
  const [vern, setVern] = useState<VernacularStrings | null>(null)
  const sidebarRef = useRef<HTMLElement>(null)
  const catalogFetchedForIso = useRef<string>("")

  const iso = isoProp || storeIso || "eng"
  // UI chrome language follows the region's own configured language (per
  // region_config.toml — e.g. Mexico deployments default to Spanish) as the
  // baseline, not the content language currently being read — but the
  // CDN's 2026.07.18 release now ships real vernacular UI strings for a
  // handful of languages (see vernacular-ui.ts), which win over the region
  // default when this reading language has one and the concept has a
  // mapped equivalent.
  const lang = uiLangForRegion($activeRegion.get())
  // storyTree/SidebarTreeNode labels only ever ship en/es (see the source
  // `label: { en, es }` shape) — narrow for indexing; t()'s own fallback
  // logic handles any other region language for translate() calls above.
  const labelLang: "en" | "es" = lang === "es" ? "es" : "en"
  const tr = (k: string) => vernacularLabel(vern, `nav.${k}`, translate(lang, `nav.${k}`))
  const trReader = (k: string) => vernacularLabel(vern, `reader.${k}`, translate(lang, `reader.${k}`))

  useEffect(() => {
    setVern(null)
    loadVernacularNav(iso).then(setVern)
  }, [iso])
  const t = {
    nav: tr("navigation"),
    close: tr("closeMenu"),
    ot: tr("ot"),
    nt: tr("nt"),
    clearStudy: tr("clearAnswers"),
  }

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

    function applyCatalog(catalog: { documents?: any[] }) {
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
    }

    async function fetchCatalog() {
      try {
        // English (and any other language routed to the full helloAO chapter
        // reader) has no PKF catalog on the CDN — fetch it live from helloAO,
        // same mechanism the reader itself uses.
        if (iso === "eng") {
          applyCatalog(await fetchHelloaoCatalog("BSB"))
          return
        }
        // Non-.pkf language (e.g. Spanish via DBT): get the vernacular book
        // list from helloao for the left-pane Bible tree.
        if (!(await shouldProbePkf(iso))) {
          const list = await loadBookList(iso)
          if (list) {
            setAvailableBooks(new Set(list.map((b) => b.code)))
            setLocalizedBookNames(new Map(list.map((b) => [b.code, b.name])))
          }
          return
        }
        const infoRes = await fetch(pkfUrl(`/pkf/${iso}/info.json`))
        if (!infoRes.ok) return
        const info = await infoRes.json()
        const pkf = info.assets?.find((a: any) => a.kind === "pkf")
        const cat = pkf ? info.assets?.find((a: any) => a.kind === "json" && a.base === pkf.base) : null
        if (!cat) return
        const catRes = await fetch(pkfUrl(`/pkf/${iso}/${cat.name}`))
        if (!catRes.ok) return
        applyCatalog(await catRes.json())
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
    if (!lastUpdated) return
    const { queryIndex, branchKeys } = lastUpdated
    if (!branchKeys.length) return
    setExpanded((prev) => {
      let next = new Set(prev)
      for (const s of TOP_LEVEL_IDS) if (s !== "study_topic") next.delete(s)
      next.add("study_topic")
      const queries = $navBranches.get()
      const queryIds = queries.map((_, i) => `query-${i}`)
      for (const qid of queryIds) next.delete(qid)
      const qid = `query-${queryIndex}`
      next.add(qid)
      const entry = queries[queryIndex]
      if (entry) {
        const branchIds = Object.keys(entry.branches).map((k) => `${qid}:${k}`)
        for (const bid of branchIds) next.delete(bid)
        next.add(`${qid}:${branchKeys[0]}`)
      }
      return next
    })
  }, [lastUpdated])

  useEffect(() => {
    document.body.classList.toggle("app-sidebar-open", isOpen)
    window.dispatchEvent(new CustomEvent("sidebar-state-changed", { detail: { isOpen } }))
  }, [isOpen])

  // Track whether the currently-open chapter is bookmarked — Reader.svelte
  // owns the actual toggle/storage, this just mirrors it (see bookmarks.ts).
  // Share/Bookmark used to live in the reader topbar; moved here since this
  // is the Study-mode left nav (StandardSidebar carries the Standard-mode
  // equivalent — AppSidebar has no bottom bar to fall back on).
  useEffect(() => {
    const refresh = () => setCurrentBookmarked(isBookmarked(currentBookmarkKey(iso)))
    refresh()
    window.addEventListener("bookmark-state-changed", refresh)
    window.addEventListener("bible-position-changed", refresh)
    return () => {
      window.removeEventListener("bookmark-state-changed", refresh)
      window.removeEventListener("bible-position-changed", refresh)
    }
  }, [iso])

  function toggleCurrentBookmark() {
    window.dispatchEvent(new CustomEvent("toggle-bookmark"))
    setCurrentBookmarked((v) => !v)
  }

  async function share() {
    const ok = await shareCurrentPage()
    if (ok) {
      setShared(true)
      setTimeout(() => setShared(false), 1400)
    }
  }

  function toggleTopLevel(id: string) {
    setExpanded((prev) => exclusiveOpen(prev, id, TOP_LEVEL_IDS))
  }

  function hrefFor(route: string) {
    return route ? `/${iso}/${route}` : `/${iso}`
  }

  function isActivePath(href: string) {
    return isActiveFull(href)
  }

  // The study/bible/branch panes live only on the language home (/{iso}/) and
  // /l/. From any other page (a story, browse, landing, …) switch to the study
  // pane by navigating to the language home with a ?pane= signal.
  function onPanePage() {
    if (typeof window === "undefined") return false
    const p = window.location.pathname
    return /^\/[a-z]{3}\/?$/.test(p) || /^\/l\/?$/.test(p)
  }

  function openStudy() {
    if (onPanePage()) showStudy()
    else window.location.href = `/${iso}/?pane=study`
  }

  function openBranch(branchKey: string, queryIndex?: number, idx: number | null = null) {
    if (onPanePage()) {
      showBranch(branchKey, queryIndex, idx)
    } else {
      const qi = queryIndex != null ? `&qi=${queryIndex}` : ""
      const i = idx != null ? `&i=${idx}` : ""
      window.location.href = `/${iso}/?pane=branch&branch=${branchKey}${qi}${i}`
    }
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
            {node.label[labelLang]}
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
          <span className="app-sidebar-tree-label">{node.label[labelLang]}</span>
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

  function renderAnswerItems(items: SearchHit[], branchKey: string, queryIndex: number) {
    return (
      <ul className="app-sidebar-items">
        {items.map((hit, idx) => (
          <li key={hit.chunk_id || idx}>
            <button
              className="app-sidebar-item"
              type="button"
              onClick={() => openBranch(branchKey, queryIndex, idx)}
            >
              <span className="app-sidebar-item-label">
                {hit.passage || hit.title || (hit as any).headline || "—"}
              </span>
            </button>
          </li>
        ))}
      </ul>
    )
  }

  const hasAnyAnswers = navBranches.length > 0
  const queryNodeIds = navBranches.map((_, i) => `query-${i}`)

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

        <ul className="app-sidebar-util">
          <li>
            <button type="button" className={currentBookmarked ? "active" : ""} onClick={toggleCurrentBookmark}>
              <span aria-hidden="true">{currentBookmarked ? "★" : "☆"}</span>
              {currentBookmarked ? trReader("removeBookmark") : trReader("bookmark")}
            </button>
          </li>
          <li>
            <button type="button" onClick={share}>
              <span aria-hidden="true">⇪</span>
              {shared ? trReader("linkCopied") : trReader("shareLink")}
            </button>
          </li>
        </ul>

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
                  <span className="app-sidebar-root-label">{tr("stories")}</span>
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

            {/* ── Bible (Standard+) ── */}
            {uiLevel >= 2 && bibleBooks && bibleBooks.length > 0 && (
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
                  <span className="app-sidebar-root-label">{tr("bible")}</span>
                </button>
                {bibleOpen && (
                  <ul className="app-sidebar-tree-children">
                    {otBooks.length > 0 && renderBibleTestament("bible-ot", t.ot, otBooks, "bible-nt")}
                    {ntBooks.length > 0 && renderBibleTestament("bible-nt", t.nt, ntBooks, "bible-ot")}
                  </ul>
                )}
              </li>
            )}

            {/* ── Study topic (Study level only) ── */}
            {uiLevel >= 3 && (
            <li className="app-sidebar-root">
              <button
                className={`app-sidebar-root-row toggle ${activePane.pane === "study" || activePane.pane === "branch" ? "active" : ""}`}
                type="button"
                onClick={() => {
                  toggleTopLevel("study_topic")
                  openStudy()
                }}
                aria-expanded={studyOpen}
              >
                <span className={`app-sidebar-arrow ${studyOpen ? "open" : ""}`}>›</span>
                <span className="app-sidebar-icon">💬</span>
                <span className="app-sidebar-root-label">{tr("studyTopic")}</span>
              </button>
              {studyOpen && (
                <>
                  <ul className="app-sidebar-tree-children">
                    {navBranches.map((entry, qi) => {
                      const qid = `query-${qi}`
                      const queryOpen = expanded.has(qid)
                      const branchKeys = Object.keys(entry.branches).filter(
                        (k) => (entry.branches[k]?.length ?? 0) > 0,
                      )
                      const branchNodeIds = branchKeys.map((k) => `${qid}:${k}`)
                      const isActiveQuery = activePane.pane === "branch" && activePane.queryIndex === qi

                      return (
                        <li key={qid}>
                          <button
                            className={`app-sidebar-tree-row ${isActiveQuery ? "active" : ""}`}
                            type="button"
                            onClick={() => {
                              setExpanded((prev) => exclusiveOpen(prev, qid, queryNodeIds))
                            }}
                            style={{ paddingLeft: "1rem" }}
                            aria-expanded={queryOpen}
                          >
                            <span className={`app-sidebar-arrow ${queryOpen ? "open" : ""}`}>›</span>
                            <span className="app-sidebar-tree-label">"{entry.query}"</span>
                            <span className="app-sidebar-tree-count">{branchKeys.length}</span>
                          </button>
                          {queryOpen && (
                            <ul className="app-sidebar-tree-children">
                              {branchKeys.map((bk) => {
                                const items = entry.branches[bk] ?? []
                                const bid = `${qid}:${bk}`
                                const branchOpen = expanded.has(bid)
                                const meta = BRANCH_META[bk]
                                const branchIcon = meta?.icon ?? "•"
                                const branchLabel = meta ? translate(lang, `branches.${meta.key}`) : bk
                                const isActiveBranch =
                                  activePane.pane === "branch" &&
                                  activePane.queryIndex === qi &&
                                  activePane.branchKey === bk
                                return (
                                  <li key={bid}>
                                    <button
                                      className={`app-sidebar-tree-row ${isActiveBranch ? "active" : ""}`}
                                      type="button"
                                      onClick={() => {
                                        setExpanded((prev) => exclusiveOpen(prev, bid, branchNodeIds))
                                        openBranch(bk, qi)
                                      }}
                                      style={{ paddingLeft: "1.7rem" }}
                                      aria-expanded={branchOpen}
                                    >
                                      <span className={`app-sidebar-arrow ${branchOpen ? "open" : ""}`}>›</span>
                                      <span className="app-sidebar-icon" style={{ fontSize: "0.8rem" }}>{branchIcon}</span>
                                      <span className="app-sidebar-tree-label">{branchLabel}</span>
                                      <span className="app-sidebar-badge">{items.length}</span>
                                    </button>
                                    {branchOpen && renderAnswerItems(items, bk, qi)}
                                  </li>
                                )
                              })}
                            </ul>
                          )}
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
            )}
          </ul>
        </nav>
      </aside>
    </>
  )
}
