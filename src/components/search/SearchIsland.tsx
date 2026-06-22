import { useState, useEffect, useRef, useCallback } from "react"
import { useStore } from "@nanostores/react"
import { $apiConfigured } from "../../stores/api-store"
import { $searchMode, setSearchMode, type SearchMode } from "../../stores/search-store"
import { study } from "../../lib/api/study"
import { ask } from "../../lib/api/ask"
import type { AskResponse, StudyResponse } from "../../lib/api/types"
import { getIsoFromUrl } from "../../lib/bw/iso-from-url"

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
    results: (n: number) => `${n} results`,
    showMore: (n: number) => `Show ${n} more results`,
    citations: (n: number) => `${n} citations`,
    showSources: (n: number) => `Show ${n} source${n === 1 ? "" : "s"}`,
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
    results: (n: number) => `${n} resultados`,
    showMore: (n: number) => `Mostrar ${n} resultados más`,
    citations: (n: number) => `${n} citas`,
    showSources: (n: number) => `Mostrar ${n} fuente${n === 1 ? "" : "s"}`,
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
  const [expandedTurns, setExpandedTurns] = useState<Set<number>>(new Set())
  const [resolvedIso, setResolvedIso] = useState(isoProp || "eng")
  const scrollRef = useRef<HTMLDivElement>(null)

  const iso = resolvedIso
  const uiLang = iso === "eng" ? "en" : "es"
  const t = strings[uiLang]

  useEffect(() => {
    if (!isoProp) setResolvedIso(getIsoFromUrl("eng"))
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

    const apiLang = iso === "eng" ? "en" : "es"
    const promise =
      mode === "premium"
        ? ask({ question: query, lang: apiLang, password }).then((data) => ({ kind: "ask" as const, data }))
        : study({ question: query, lang: apiLang }).then((data) => ({ kind: "study" as const, data }))

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
                  {turn.result.data.citations.length === 0 ? (
                    <p className="bubble-empty">{t.noResults(turn.query)}</p>
                  ) : (
                    <>
                      <p className="bubble-summary">{t.results(turn.result.data.total)}</p>
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
                          {t.showMore(turn.result.data.citations.length - 3)}
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
                    <span className="cite-count">{t.citations(turn.result.data.citations.length)}</span>
                  </div>
                  <div className="answer-body">{turn.result.data.answer}</div>
                  {turn.result.data.citations.length > 0 && (
                    <details className="citations-details">
                      <summary className="citations-summary">
                        {t.showSources(turn.result.data.citations.length)}
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
