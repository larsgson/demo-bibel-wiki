import { useState, useEffect, useRef, useCallback } from "react"
import { useStore } from "@nanostores/react"
import { $apiConfigured, apiFetch } from "../../stores/api-store"
import { $searchMode, setSearchMode, type SearchMode } from "../../stores/search-store"
import { searchBranched } from "../../lib/api/search-branched"
import { askBranched } from "../../lib/api/ask-branched"
import { branchKey as bKey, type BranchedSearchResponse, type BranchedAskResponse, type Branch, type SearchHit, type Card } from "../../lib/api/types"
import { $selectedIso, initIsoFromUrl } from "../../stores/iso-store"
import { mergeBranches, clearNavBranches } from "../../stores/nav-branches-store"
import { extractBibleHighlights, clearBibleHighlights } from "../../stores/bible-highlight-store"
import { $activePane } from "../../stores/branch-view-store"


type Result =
  | { kind: "study"; data: BranchedSearchResponse }
  | { kind: "ask"; data: BranchedAskResponse }

type Turn = {
  query: string
  mode: SearchMode
  result: Result | null
  error: string | null
  loading: boolean
}

const PW_KEY = "premium_password"
const HISTORY_KEY = "search_history"

const strings = {
  en: {
    studyWelcome: "Study the Bible",
    askWelcome: "Ask a question about the Bible",
    studyHint: "Find relevant scripture passages and resources",
    askHint: "AI-powered answers with citations",
    studying: "Studying…",
    thinking: "Thinking…",
    requestFailed: "Request failed",
    noResults: (q: string) => `No results for "${q}".`,
    moreInBranch: (n: number) => `+${n} more`,
    exploreSources: "Explore the sources",
    studyPlaceholder: "Study a topic…",
    askPlaceholder: "Ask a question…",
    switchToStudy: "Switch to Study",
    switchToAI: "Switch to AI answers",
    studyLabel: "Study",
    aiLabel: "AI",
    clearHistory: "Clear history",
    enterPassword: "Enter premium password",
    passwordPlaceholder: "Password",
    cancel: "Cancel",
    ok: "OK",
    apiNotConfigured: "API not configured. Set PUBLIC_API_BASE_URL.",
    premiumNeedsPassword: "Premium requires a password. Toggle Premium to enter one.",
    networkError: "Network error reaching the API.",
    passwordRejected: "Password rejected.",
  },
  es: {
    studyWelcome: "Estudiar la Biblia",
    askWelcome: "Haz una pregunta sobre la Biblia",
    studyHint: "Encuentra pasajes y recursos bíblicos relevantes",
    askHint: "Respuestas con inteligencia artificial y citas",
    studying: "Buscando…",
    thinking: "Pensando…",
    requestFailed: "Error en la solicitud",
    noResults: (q: string) => `Sin resultados para "${q}".`,
    moreInBranch: (n: number) => `+${n} más`,
    exploreSources: "Explorar las fuentes",
    studyPlaceholder: "Estudiar un tema…",
    askPlaceholder: "Haz una pregunta…",
    switchToStudy: "Cambiar a Estudio",
    switchToAI: "Cambiar a respuestas IA",
    studyLabel: "Estudio",
    aiLabel: "IA",
    clearHistory: "Borrar historial",
    enterPassword: "Ingresa la contraseña premium",
    passwordPlaceholder: "Contraseña",
    cancel: "Cancelar",
    ok: "OK",
    apiNotConfigured: "API no configurada. Establece PUBLIC_API_BASE_URL.",
    premiumNeedsPassword: "Premium requiere contraseña. Activa Premium para ingresarla.",
    networkError: "Error de red al contactar la API.",
    passwordRejected: "Contraseña rechazada.",
  },
}

const GLOSS_LANG: Record<string, string> = {
  eng: "English", spa: "Spanish", fra: "French", por: "Portuguese",
  deu: "German", ind: "Indonesian", zho: "Chinese", arb: "Arabic",
  hin: "Hindi", ben: "Bengali", asm: "Assamese", hau: "Hausa", rus: "Russian",
  en: "English", es: "Spanish", fr: "French", pt: "Portuguese",
  de: "German", id: "Indonesian", zh: "Chinese", ar: "Arabic",
  hi: "Hindi", bn: "Bengali", as: "Assamese", ha: "Hausa", ru: "Russian",
}

const CARD_KIND_ICON: Record<string, string> = {
  passage: "\u{1F4D6}", concept: "\u{1F4A1}", entity: "\u{1F464}",
  speaker: "\u{1F5E3}️", "cross-ref": "\u{1F517}",
}

function branchItems(b: Branch): SearchHit[] {
  return b.items ?? b.leads ?? []
}

function renderMarkdown(md: string) {
  return md
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    .replace(/_(.+?)_/g, "<em>$1</em>")
    .replace(/\n\n/g, "</p><p>")
    .replace(/\n/g, "<br>")
}

function ExpandableHitCard({ hit }: { hit: SearchHit }) {
  const [expanded, setExpanded] = useState(false)
  const [fullBody, setFullBody] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const title = hit.title || (hit as any).headline || ""
  const excerpt = hit.excerpt ?? (hit as any).headline ?? ""

  async function expand() {
    if (expanded) { setExpanded(false); return }
    if (fullBody) { setExpanded(true); return }
    if (!hit.chunk_id) { return }
    setLoading(true)
    try {
      const data = await apiFetch<{ body: string }>(`/api/chunk/${hit.chunk_id}`)
      setFullBody(data.body)
      setExpanded(true)
    } catch {
      setFullBody(excerpt)
      setExpanded(true)
    } finally {
      setLoading(false)
    }
  }

  const isTruncated = excerpt.endsWith("…") || excerpt.endsWith("...")
  const canExpand = !!hit.chunk_id

  return (
    <article className={`hit-card ${expanded ? "expanded" : ""}`}>
      <h3 className={`hit-title${canExpand ? " clickable" : ""}`} onClick={canExpand ? expand : undefined}>
        {title}
        {loading && <span className="branch-content-loading"> ...</span>}
      </h3>
      {hit.passage && <p className="hit-passage">{hit.passage}</p>}
      {expanded && fullBody ? (
        <div
          className="hit-excerpt hit-body-full"
          dangerouslySetInnerHTML={{ __html: renderMarkdown(fullBody) }}
        />
      ) : excerpt ? (
        <p className="hit-excerpt">
          <span dangerouslySetInnerHTML={{ __html: renderMarkdown(excerpt) }} />
          {isTruncated && canExpand && (
            <button className="branch-content-expand" onClick={expand} type="button">
              {loading ? "..." : "…"}
            </button>
          )}
        </p>
      ) : null}
      <div className="hit-footer">
        <span className="hit-kind">{hit.kind}</span>
      </div>
    </article>
  )
}

interface Props {
  iso: string
}

export function SearchIsland({ iso: isoProp }: Props) {
  const configured = useStore($apiConfigured)
  const mode = useStore($searchMode)
  const [turns, setTurns] = useState<Turn[]>([])
  const [inputValue, setInputValue] = useState("")
  const [password, setPassword] = useState("")
  const [showPwModal, setShowPwModal] = useState(false)
  const [expandedBranches, setExpandedBranches] = useState<Set<string>>(new Set())
  const storeIso = useStore($selectedIso)
  const scrollRef = useRef<HTMLDivElement>(null)
  const [visible, setVisible] = useState(true)

  const iso = isoProp || storeIso || "eng"
  const uiLang = iso === "eng" ? "en" : "es"
  const t = strings[uiLang]

  useEffect(() => {
    // Study pane is Study-level (3) only.
    const studyAllowed = () => localStorage.getItem("bw-ui-level") === "3"
    // Initial visibility from the current pane (set from ?pane= / level default),
    // since a fresh load fires no pane-changed event.
    setVisible($activePane.get().pane === "study" && studyAllowed())
    const onPaneChanged = (e: Event) => {
      const pane = (e as CustomEvent).detail?.pane || "bible"
      setVisible(pane === "study" && studyAllowed())
    }
    const onLevelChanged = () => {
      if (!studyAllowed()) setVisible(false)
    }
    window.addEventListener("pane-changed", onPaneChanged)
    window.addEventListener("ui-level-changed", onLevelChanged)
    return () => {
      window.removeEventListener("pane-changed", onPaneChanged)
      window.removeEventListener("ui-level-changed", onLevelChanged)
    }
  }, [])

  useEffect(() => {
    if (!isoProp) initIsoFromUrl()
    setPassword(sessionStorage.getItem(PW_KEY) ?? "")
    try {
      const raw = sessionStorage.getItem(HISTORY_KEY)
      if (raw) {
        const parsed = JSON.parse(raw) as Turn[]
        setTurns(parsed.filter((t) => !t.loading).filter((t) => {
          if (!t.result) return true
          return Array.isArray(t.result.data?.branches)
        }))
      }
    } catch {}

    const q = new URLSearchParams(window.location.search).get("q")?.trim()
    if (q) submitQuery(q)
  }, [])

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" })
  }, [turns])

  const saveHistory = useCallback((t: Turn[]) => {
    try {
      sessionStorage.setItem(HISTORY_KEY, JSON.stringify(t.filter((x) => !x.loading)))
    } catch {}
  }, [])

  function submitQuery(q?: string) {
    const query = (q ?? inputValue).trim()
    if (!query) return
    setInputValue("")

    if (!configured) {
      const turn: Turn = { query, mode, result: null, error: t.apiNotConfigured, loading: false }
      setTurns((prev) => { const next = [...prev, turn]; saveHistory(next); return next })
      return
    }
    if (mode === "premium" && !password) {
      const turn: Turn = { query, mode, result: null, error: t.premiumNeedsPassword, loading: false }
      setTurns((prev) => { const next = [...prev, turn]; saveHistory(next); return next })
      return
    }

    const turnIdx = turns.length
    const newTurn: Turn = { query, mode, result: null, error: null, loading: true }

    setTurns((prev) => [...prev, newTurn])
    setExpandedBranches(new Set())

    const apiLang = iso === "eng" ? "en" : "es"
    const promise =
      mode === "premium"
        ? askBranched({ question: query, lang: apiLang, password }).then((data) => ({ kind: "ask" as const, data }))
        : searchBranched({ q: query, lang: apiLang }).then((data) => ({ kind: "study" as const, data }))

    promise
      .then((res) => {
        // Feed the answer's branches into the global nav rail (skips verses).
        mergeBranches(res.data.branches)
        // Extract Bible references for yellow highlights in the sidebar tree.
        extractBibleHighlights(res.data.branches)
        setTurns((prev) => {
          const next = [...prev]
          next[turnIdx] = { ...next[turnIdx], result: res, loading: false }
          saveHistory(next)
          return next
        })
      })
      .catch((err: any) => {
        const errorMsg =
          err?.code === "network"
            ? t.networkError
            : err?.status === 401 || err?.status === 403
            ? t.passwordRejected
            : err?.detail || err?.message || t.requestFailed
        setTurns((prev) => {
          const next = [...prev]
          next[turnIdx] = { ...next[turnIdx], error: errorMsg, loading: false }
          saveHistory(next)
          return next
        })
      })
  }

  function toggleMode() {
    if (mode === "free") {
      setSearchMode("premium")
      const saved = sessionStorage.getItem(PW_KEY)
      if (saved) setPassword(saved)
      else setShowPwModal(true)
    } else {
      setSearchMode("free")
    }
  }

  function savePw(pw: string) {
    setPassword(pw)
    sessionStorage.setItem(PW_KEY, pw)
    setShowPwModal(false)
  }

  function clearHistory() {
    setTurns([])
    sessionStorage.removeItem(HISTORY_KEY)
    clearBibleHighlights()
    clearNavBranches()
  }

  function toggleBranch(turnIdx: number, key: string) {
    setExpandedBranches((prev) => {
      const id = `${turnIdx}:${key}`
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function isBranchExpanded(turnIdx: number, key: string) {
    return expandedBranches.has(`${turnIdx}:${key}`)
  }

  function confidenceColor(c: string): string {
    return c === "high" ? "rgb(0,11,99)" : c === "medium" ? "rgb(100,100,140)" : "rgb(180,80,20)"
  }

  // Render an answer string with **bold** and inline [chunk_id] citation pills.
  // Each pill links to the exact location of that chunk (the static content).
  function renderAnswer(answer: string, branches: Branch[]) {
    const lookup = new Map<string, SearchHit>()
    for (const b of branches) for (const it of branchItems(b)) lookup.set(it.chunk_id, it)

    // Tokenize on **bold** or [citation] markers.
    const re = /\*\*([^*]+)\*\*|\[([^\]]+)\]/g
    const nodes: React.ReactNode[] = []
    let last = 0
    let m: RegExpExecArray | null
    let key = 0
    while ((m = re.exec(answer)) !== null) {
      if (m.index > last) nodes.push(answer.slice(last, m.index))
      if (m[1] !== undefined) {
        nodes.push(<strong key={key++}>{m[1]}</strong>)
      } else {
        const id = m[2]
        const hit = lookup.get(id)
        if (hit) {
          const label = hit.passage || hit.title || id
          nodes.push(
            <span
              key={key++}
              className="citation-link"
              title={hit.title}
            >
              📖 {label}
            </span>,
          )
        } else {
          nodes.push(m[0]) // unknown id — leave raw
        }
      }
      last = re.lastIndex
    }
    if (last < answer.length) nodes.push(answer.slice(last))
    return nodes
  }

  function renderHitCard(hit: SearchHit, idx: number) {
    return <ExpandableHitCard key={hit.chunk_id ?? idx} hit={hit} />
  }

  function renderBranch(branch: Branch, turnIdx: number, branchIdx: number) {
    const isOpen = isBranchExpanded(turnIdx, bKey(branch))
    const hits = branchItems(branch)
    const total = branch.total ?? branch.n ?? hits.length
    const remaining = total - hits.length

    return (
      <div key={`${bKey(branch)}-${branchIdx}`} className={`branch ${isOpen ? "branch-open" : "branch-collapsed"}`}>
        <button
          type="button"
          className="branch-header"
          onClick={() => toggleBranch(turnIdx, bKey(branch))}
        >
          <span className="branch-label">{branch.label}</span>
          <span className="branch-count">{total}</span>
          <span className="branch-chevron">{isOpen ? "▾" : "▸"}</span>
        </button>
        {isOpen && (
          <div className="branch-items">
            {hits.map(renderHitCard)}
            {remaining > 0 && (
              <p className="branch-more">{t.moreInBranch(remaining)}</p>
            )}
          </div>
        )}
      </div>
    )
  }

  function renderBranches(branches: Branch[], turnIdx: number) {
    const hasFeatured = branches.some((b) => b.featured && branchItems(b).length > 0)
    if (!hasFeatured && branches.every((b) => branchItems(b).length === 0)) return null

    return (
      <div className="branches">
        {branches.map((b, i) => renderBranch(b, turnIdx, i))}
      </div>
    )
  }

  function drillHref(drill: string): string {
    const base = import.meta.env.PUBLIC_API_BASE_URL?.replace(/\/$/, "") ?? ""
    const gloss = GLOSS_LANG[iso] ?? "English"
    const sep = drill.includes("?") ? "&" : "?"
    return `${base}${drill}${sep}gloss_lang=${encodeURIComponent(gloss)}`
  }

  function renderCards(cards: Card[]) {
    if (!cards.length) return null
    return (
      <div className="drill-cards">
        {cards.map((card, i) => {
          const icon = CARD_KIND_ICON[card.kind] ?? "\u{1F50D}"
          const inner = (
            <>
              <span className="drill-card-icon">{icon}</span>
              <span className="drill-card-anchor">{card.anchor}</span>
              <span className="drill-card-kind">{card.kind}</span>
              {card.domains && card.domains.length > 0 && (
                <span className="drill-card-domains">{card.domains.slice(0, 3).join(" · ")}</span>
              )}
            </>
          )
          return card.drill ? (
            <a key={i} className={`drill-card${card.featured ? " featured" : ""}`} href={drillHref(card.drill)} target="_blank" rel="noopener">
              {inner}
            </a>
          ) : (
            <div key={i} className={`drill-card${card.featured ? " featured" : ""}`}>
              {inner}
            </div>
          )
        })}
      </div>
    )
  }

  return (
    <div className="chat-shell" style={{ display: visible ? "" : "none" }}>
      <div className="chat-scroll" ref={scrollRef}>
        {turns.length === 0 ? (
          <div className="chat-welcome">
            <div className="chat-welcome-icon">💬</div>
            <p className="chat-welcome-text">
              {mode === "premium" ? t.askWelcome : t.studyWelcome}
            </p>
            <p className="chat-welcome-hint">
              {mode === "premium" ? t.askHint : t.studyHint}
            </p>
          </div>
        ) : (
          turns.map((turn, ti) => (
            <div key={ti}>
              <div className="chat-bubble user-bubble">
                <span className="bubble-mode">{turn.mode === "premium" ? t.aiLabel : t.studyLabel}</span>
                <span className="bubble-query">{turn.query}</span>
              </div>

              {turn.loading ? (
                <div className="chat-bubble ai-bubble">
                  <span className="loading-dots">{turn.mode === "premium" ? t.thinking : t.studying}</span>
                </div>
              ) : turn.error ? (
                <div className="chat-bubble ai-bubble error-bubble">
                  <p className="bubble-error-title">{t.requestFailed}</p>
                  <p className="bubble-error-msg">{turn.error}</p>
                </div>
              ) : turn.result?.kind === "study" ? (
                <div className="chat-bubble ai-bubble">
                  {turn.result.data.branches.every((b) => branchItems(b).length === 0) ? (
                    <p className="bubble-empty">{t.noResults(turn.query)}</p>
                  ) : (
                    renderBranches(turn.result.data.branches, ti)
                  )}
                </div>
              ) : turn.result?.kind === "ask" ? (
                <div className="chat-bubble ai-bubble">
                  <div className="answer-meta">
                    <span className="confidence-badge" style={{ background: confidenceColor(turn.result.data.confidence) }}>
                      {turn.result.data.confidence}
                    </span>
                  </div>
                  <div className="answer-body">{renderAnswer(turn.result.data.answer, turn.result.data.branches)}</div>
                  {turn.result.data.cards && turn.result.data.cards.length > 0 && renderCards(turn.result.data.cards)}
                  {turn.result.data.branches.length > 0 && (
                    <details className="citations-details" open>
                      <summary className="citations-summary">{t.exploreSources}</summary>
                      {renderBranches(turn.result.data.branches, ti)}
                    </details>
                  )}
                </div>
              ) : null}
            </div>
          ))
        )}
      </div>

      <div className="chat-input-bar">
        {turns.length > 0 && (
          <button className="clear-btn" type="button" onClick={clearHistory} title={t.clearHistory}>×</button>
        )}
        <form className="chat-form" onSubmit={(e) => { e.preventDefault(); submitQuery() }}>
          <input
            className="chat-input"
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            placeholder={mode === "premium" ? t.askPlaceholder : t.studyPlaceholder}
          />
          <button className="chat-send" type="submit" disabled={!inputValue.trim()}>➤</button>
        </form>
        <button
          className={`mode-toggle ${mode === "premium" ? "premium" : ""}`}
          type="button"
          onClick={toggleMode}
          title={mode === "premium" ? t.switchToStudy : t.switchToAI}
        >
          {mode === "premium" ? t.aiLabel : t.studyLabel}
        </button>
      </div>

      {showPwModal && (
        <div className="modal-backdrop" onClick={() => setShowPwModal(false)}>
          <div className="modal-box" onClick={(e) => e.stopPropagation()}>
            <h3 className="modal-title">{t.enterPassword}</h3>
            <form onSubmit={(e) => { e.preventDefault(); const fd = new FormData(e.currentTarget); savePw(fd.get("pw") as string) }}>
              <input className="modal-input" type="password" name="pw" placeholder={t.passwordPlaceholder} autoComplete="off" />
              <div className="modal-actions">
                <button type="button" className="modal-cancel" onClick={() => { setShowPwModal(false); setSearchMode("free") }}>{t.cancel}</button>
                <button type="submit" className="modal-ok">{t.ok}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
