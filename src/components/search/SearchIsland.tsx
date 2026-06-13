import { useState, useEffect, useRef, useCallback } from "react"
import { useStore } from "@nanostores/react"
import { $apiConfigured } from "../../stores/api-store"
import { $searchMode, setSearchMode, type SearchMode } from "../../stores/search-store"
import { study } from "../../lib/api/study"
import { ask } from "../../lib/api/ask"
import type { AskResponse, StudyResponse } from "../../lib/api/types"

type Result =
  | { kind: "study"; data: StudyResponse }
  | { kind: "ask"; data: AskResponse }

type Turn = {
  query: string
  mode: SearchMode
  result: Result | null
  error: string | null
  loading: boolean
}

const PW_KEY = "premium_password"
const HISTORY_KEY = "search_history"

interface Props {
  iso: string
}

export function SearchIsland({ iso }: Props) {
  const configured = useStore($apiConfigured)
  const mode = useStore($searchMode)
  const [turns, setTurns] = useState<Turn[]>([])
  const [inputValue, setInputValue] = useState("")
  const [password, setPassword] = useState("")
  const [showPwModal, setShowPwModal] = useState(false)
  const [expandedTurns, setExpandedTurns] = useState<Set<number>>(new Set())
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setPassword(sessionStorage.getItem(PW_KEY) ?? "")
    try {
      const raw = sessionStorage.getItem(HISTORY_KEY)
      if (raw) {
        const parsed = JSON.parse(raw) as Turn[]
        setTurns(parsed.filter((t) => !t.loading))
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
      const t: Turn = { query, mode, result: null, error: "API not configured. Set PUBLIC_API_BASE_URL.", loading: false }
      setTurns((prev) => { const next = [...prev, t]; saveHistory(next); return next })
      return
    }
    if (mode === "premium" && !password) {
      const t: Turn = { query, mode, result: null, error: "Premium requires a password. Toggle Premium to enter one.", loading: false }
      setTurns((prev) => { const next = [...prev, t]; saveHistory(next); return next })
      return
    }

    const turnIdx = turns.length
    const newTurn: Turn = { query, mode, result: null, error: null, loading: true }

    setTurns((prev) => [...prev, newTurn])

    const promise =
      mode === "premium"
        ? ask({ question: query, lang: "en", password }).then((data) => ({ kind: "ask" as const, data }))
        : study({ question: query, lang: "en" }).then((data) => ({ kind: "study" as const, data }))

    promise
      .then((res) => {
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
            ? "Network error reaching the API."
            : err?.status === 401 || err?.status === 403
            ? "Password rejected."
            : err?.detail || err?.message || "Request failed."
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
  }

  function toggleExpand(idx: number) {
    setExpandedTurns((prev) => {
      const next = new Set(prev)
      if (next.has(idx)) next.delete(idx)
      else next.add(idx)
      return next
    })
  }

  function confidenceLabel(c: number): string {
    return c >= 0.7 ? "high" : c >= 0.4 ? "medium" : "low"
  }

  function confidenceColor(c: number): string {
    return c >= 0.7 ? "rgb(0,11,99)" : c >= 0.4 ? "rgb(100,100,140)" : "rgb(180,80,20)"
  }

  return (
    <div className="chat-shell">
      <div className="chat-scroll" ref={scrollRef}>
        {turns.length === 0 ? (
          <div className="chat-welcome">
            <div className="chat-welcome-icon">💬</div>
            <p className="chat-welcome-text">
              {mode === "premium" ? "Ask a question about the Bible" : "Study the Bible"}
            </p>
            <p className="chat-welcome-hint">
              {mode === "premium" ? "AI-powered answers with citations" : "Find relevant scripture passages and resources"}
            </p>
          </div>
        ) : (
          turns.map((turn, ti) => (
            <div key={ti}>
              <div className="chat-bubble user-bubble">
                <span className="bubble-mode">{turn.mode === "premium" ? "AI" : "study"}</span>
                <span className="bubble-query">{turn.query}</span>
              </div>

              {turn.loading ? (
                <div className="chat-bubble ai-bubble">
                  <span className="loading-dots">{turn.mode === "premium" ? "Thinking…" : "Studying…"}</span>
                </div>
              ) : turn.error ? (
                <div className="chat-bubble ai-bubble error-bubble">
                  <p className="bubble-error-title">Request failed</p>
                  <p className="bubble-error-msg">{turn.error}</p>
                </div>
              ) : turn.result?.kind === "study" ? (
                <div className="chat-bubble ai-bubble">
                  {turn.result.data.citations.length === 0 ? (
                    <p className="bubble-empty">No results for "{turn.query}".</p>
                  ) : (
                    <>
                      <p className="bubble-summary">{turn.result.data.total} results</p>
                      {(expandedTurns.has(ti) ? turn.result.data.citations : turn.result.data.citations.slice(0, 3)).map((c) => (
                        <article key={c.chunk_id} className="hit-card">
                          <h3 className="hit-title">
                            <a href={`/${iso}/c/${encodeURIComponent(c.chunk_id)}`}>{c.title}</a>
                          </h3>
                          {c.passage && <p className="hit-passage">{c.passage}</p>}
                          <p className="hit-excerpt">{c.excerpt}</p>
                          <div className="hit-footer">
                            <span className="hit-kind">{c.kind}</span>
                          </div>
                        </article>
                      ))}
                      {turn.result.data.citations.length > 3 && !expandedTurns.has(ti) && (
                        <button className="show-more-btn" type="button" onClick={() => toggleExpand(ti)}>
                          Show {turn.result.data.citations.length - 3} more results
                        </button>
                      )}
                    </>
                  )}
                </div>
              ) : turn.result?.kind === "ask" ? (
                <div className="chat-bubble ai-bubble">
                  <div className="answer-meta">
                    <span className="confidence-badge" style={{ background: confidenceColor(turn.result.data.confidence) }}>
                      {confidenceLabel(turn.result.data.confidence)}
                    </span>
                    <span className="cite-count">{turn.result.data.citations.length} citations</span>
                  </div>
                  <div className="answer-body">{turn.result.data.answer}</div>
                  {turn.result.data.citations.length > 0 && (
                    <details className="citations-details">
                      <summary className="citations-summary">
                        Show {turn.result.data.citations.length} source{turn.result.data.citations.length === 1 ? "" : "s"}
                      </summary>
                      <ol className="citations-list">
                        {turn.result.data.citations.map((c) => (
                          <li key={c.chunk_id} className="citation-item">
                            <span className="citation-n">[{c.n}]</span>
                            <div className="citation-body">
                              <a className="citation-title" href={`/${iso}/c/${encodeURIComponent(c.chunk_id)}`}>{c.title}</a>
                              {c.passage && <span className="citation-passage">{c.passage}</span>}
                              <p className="citation-excerpt">{c.excerpt}</p>
                            </div>
                          </li>
                        ))}
                      </ol>
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
          <button className="clear-btn" type="button" onClick={clearHistory} title="Clear history">×</button>
        )}
        <form className="chat-form" onSubmit={(e) => { e.preventDefault(); submitQuery() }}>
          <input
            className="chat-input"
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            placeholder={mode === "premium" ? "Ask a question…" : "Study a topic…"}
          />
          <button className="chat-send" type="submit" disabled={!inputValue.trim()}>➤</button>
        </form>
        <button
          className={`mode-toggle ${mode === "premium" ? "premium" : ""}`}
          type="button"
          onClick={toggleMode}
          title={mode === "premium" ? "Switch to Study" : "Switch to AI answers"}
        >
          {mode === "premium" ? "AI" : "Study"}
        </button>
      </div>

      {showPwModal && (
        <div className="modal-backdrop" onClick={() => setShowPwModal(false)}>
          <div className="modal-box" onClick={(e) => e.stopPropagation()}>
            <h3 className="modal-title">Enter premium password</h3>
            <form onSubmit={(e) => { e.preventDefault(); const fd = new FormData(e.currentTarget); savePw(fd.get("pw") as string) }}>
              <input className="modal-input" type="password" name="pw" placeholder="Password" autoComplete="off" />
              <div className="modal-actions">
                <button type="button" className="modal-cancel" onClick={() => { setShowPwModal(false); setSearchMode("free") }}>Cancel</button>
                <button type="submit" className="modal-ok">OK</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
