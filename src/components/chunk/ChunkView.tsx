import { useState, useEffect } from "react"
import { useStore } from "@nanostores/react"
import { $apiConfigured } from "../../stores/api-store"
import { getChunk } from "../../lib/api/chunk"
import type { Chunk, ChunkPreview } from "../../lib/api/types"

interface Props {
  chunkId: string
  iso: string
}

function refLabel(key: string): string {
  if (key === "passage") return "Same passage"
  if (key === "support_ref") return "Methodology references"
  if (key === "term") return "Related terms"
  return key
}

export function ChunkView({ chunkId, iso }: Props) {
  const configured = useStore($apiConfigured)
  const [chunk, setChunk] = useState<Chunk | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!configured) {
      setError("API not configured.")
      setLoading(false)
      return
    }

    setChunk(null)
    setLoading(true)
    setError(null)

    getChunk(chunkId)
      .then((data) => {
        setChunk(data)
        setLoading(false)
      })
      .catch((e: any) => {
        setError(
          e?.status === 404
            ? "Chunk not found."
            : e?.detail || e?.message || "Failed to load."
        )
        setLoading(false)
      })
  }, [chunkId, configured])

  if (loading) return <p className="chunk-status">Loading…</p>
  if (error) return <p className="chunk-status chunk-error">{error}</p>
  if (!chunk) return null

  return (
    <div className="chunk-view">
      <div className="chunk-header">
        <span className="chunk-kind">{chunk.kind}</span>
        {chunk.passage && <span className="chunk-passage">{chunk.passage}</span>}
      </div>
      <h1 className="chunk-title">{chunk.title}</h1>
      <div className="chunk-body">{chunk.body}</div>

      {chunk.tags && chunk.tags.length > 0 && (
        <div className="chunk-tags">
          {chunk.tags.map((tag) => (
            <span key={tag} className="chunk-tag">{tag}</span>
          ))}
        </div>
      )}

      {chunk.all_paths && chunk.all_paths.length > 0 && (
        <div className="chunk-paths">
          <h3 className="chunk-section-title">Tree paths</h3>
          {chunk.all_paths.map((p) => (
            <a key={p} className="chunk-path-link" href={`/${iso}/browse/${p.replace(/^\/en\//, "")}`}>
              {p}
            </a>
          ))}
        </div>
      )}

      {Object.entries(chunk.cross_refs).map(([key, refs]) =>
        refs && refs.length > 0 ? (
          <section key={key} className="chunk-xrefs">
            <h3 className="chunk-section-title">{refLabel(key)}</h3>
            {refs.map((ref: ChunkPreview) => (
              <a
                key={ref.chunk_id}
                className="xref-card"
                href={`/${iso}/c/${encodeURIComponent(ref.chunk_id)}`}
              >
                <div className="xref-top">
                  <span className="xref-title">{ref.title}</span>
                  <span className="xref-kind">{ref.kind}</span>
                </div>
                {ref.passage && <span className="xref-passage">{ref.passage}</span>}
                <p className="xref-excerpt">{ref.excerpt}</p>
              </a>
            ))}
          </section>
        ) : null
      )}

      <div className="chunk-id-footer">
        <span className="chunk-id-label">ID:</span>
        <code className="chunk-id-code">{chunk.chunk_id}</code>
      </div>
    </div>
  )
}
