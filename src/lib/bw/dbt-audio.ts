/**
 * Whole-chapter audio-stream URL resolution via the authenticated `dbt-proxy`
 * Netlify function (needs DBT_API_KEY at runtime). NT-only filesets (e.g.
 * `INZTSIN1DA` for Indonesian TSI) return null for OT books.
 *
 * helloAO is a text-only API (its `thisChapterAudioLinks` field is never
 * populated, by design), so there is no keyless audio tier to try first here
 * — this is the final fallback after `dbt-media.ts`'s raw/contrib CDN check.
 */

// A 404 from the proxy means DBT isn't reachable (e.g. key unset) — stop asking.
let dbtAvailable = true

export async function fetchDbtAudioUrl(
  fileset: string,
  bookCode: string,
  chapter: number,
): Promise<string | null> {
  if (!dbtAvailable) return null
  const params = new URLSearchParams({
    type: "audio",
    fileset_id: fileset,
    book_id: bookCode,
    chapter_id: String(chapter),
  })
  try {
    const r = await fetch(`/.netlify/functions/dbt-proxy?${params}`)
    if (r.status === 404) { dbtAvailable = false; return null }
    if (!r.ok) return null
    const j = await r.json()
    return j.data?.[0]?.path || null
  } catch {
    dbtAvailable = false
    return null
  }
}
