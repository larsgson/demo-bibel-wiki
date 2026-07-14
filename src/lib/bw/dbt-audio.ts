/**
 * Whole-chapter audio-stream URL resolution from a DBT/FCBH fileset.
 *
 * Tries the free helloao mirror first, then the authenticated `dbt-proxy`
 * Netlify function (needs DBT_API_KEY at runtime). NT-only filesets (e.g.
 * `INZTSIN1DA` for Indonesian TSI) return null for OT books.
 *
 * This mirrors the helloao→dbt-proxy tiers of StoryReaderIsland's
 * `fetchAudioUrl`, extracted so the chapter reader can reuse it. The chapter
 * reader plays whole-chapter audio (no verse sync), so no timing is involved.
 */

// A 404 from the proxy means DBT isn't reachable (e.g. key unset) — stop asking.
let dbtAvailable = true

export async function fetchDbtAudioUrl(
  fileset: string,
  bookCode: string,
  chapter: number,
): Promise<string | null> {
  // 1. helloao (free, no key)
  try {
    const r = await fetch(`https://bible.helloao.org/api/${fileset}/${bookCode}/${chapter}.json`)
    if (r.ok) {
      const d = await r.json()
      const mp3 = d?.chapter?.audio?.mp3
      if (mp3) return mp3
    }
  } catch {
    /* fall through */
  }

  // 2. dbt-proxy (skip once a 404 has shown it's unavailable)
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
