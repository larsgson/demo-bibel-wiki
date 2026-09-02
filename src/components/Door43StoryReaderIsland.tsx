import { useState, useEffect, useRef, useCallback } from "react"
import { useStore } from "@nanostores/react"
import { $selectedLanguage } from "../stores/language-store"
import {
  loadObsMedia,
  loadObsTiming,
  fetchDoor43Story,
  type Door43Story,
  type ObsMedia,
  type ObsTiming,
} from "../lib/bw/door43-obs"
import type { LocaleData } from "../lib/bw/types"

interface Props {
  templateName: string
  storyId: string
  engLocale: LocaleData | null
}

type LoadState = "loading" | "ready" | "no-language" | "error"

/**
 * Reader for door43-live templates (OBS-UW) — text, images, audio, and
 * segment-level timing sync, all resolved live from cdn.bibel.wiki's OBS
 * catalog (src/lib/bw/door43-obs.ts) rather than baked in at build time.
 * Deliberately a separate, minimal component rather than a new branch in
 * StoryReaderIsland.tsx — that component's Bible-verse-shaped markdown/
 * audio/timing pipeline doesn't apply to OBS's story/segment shape at all,
 * and this keeps every existing template's working code path untouched.
 */
export default function Door43StoryReaderIsland({ storyId, engLocale }: Props) {
  const selectedLang = useStore($selectedLanguage)
  const [story, setStory] = useState<Door43Story | null>(null)
  const [media, setMedia] = useState<ObsMedia | null>(null)
  const [timing, setTiming] = useState<ObsTiming | null>(null)
  const [state, setState] = useState<LoadState>("loading")
  const [activeSegment, setActiveSegment] = useState<number | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)

  useEffect(() => {
    let cancelled = false
    setState("loading")
    setActiveSegment(null)

    loadObsMedia(selectedLang).then(async (m) => {
      if (cancelled) return
      if (!m) {
        setMedia(null)
        setStory(null)
        setState("no-language")
        return
      }
      setMedia(m)
      const [s, t] = await Promise.all([
        fetchDoor43Story(m, storyId),
        loadObsTiming(selectedLang),
      ])
      if (cancelled) return
      setTiming(t)
      if (s) {
        setStory(s)
        setState("ready")
      } else {
        setStory(null)
        setState("error")
      }
    })

    return () => {
      cancelled = true
    }
  }, [selectedLang, storyId])

  // Segment timing for this story, if published — {segment: [start, end]},
  // 1-indexed to match door43's own segment numbering (one per image+text
  // block, in the same order the markdown parser emits sections).
  const storyTiming = timing?.[storyId] ?? null
  const audioUrl = media?.stories[storyId]?.audio_url ?? null

  const handleTimeUpdate = useCallback(() => {
    if (!storyTiming || !audioRef.current) return
    const t = audioRef.current.currentTime
    let current: number | null = null
    for (const [segStr, [start, end]] of Object.entries(storyTiming)) {
      if (t >= start && (t < end || start === end)) {
        current = parseInt(segStr, 10)
        break
      }
    }
    setActiveSegment(current)
  }, [storyTiming])

  const seekToSegment = (index: number) => {
    if (!storyTiming || !audioRef.current) return
    const seg = storyTiming[String(index + 1)]
    if (!seg) return
    audioRef.current.currentTime = seg[0]
    audioRef.current.play().catch(() => {})
  }

  // media.stories[id].title (from media.json, available as soon as that
  // fetch resolves) shows a real vernacular title before the full story
  // fetch completes — same underlying title door43 itself has, just
  // pre-parsed by the CDN so this doesn't have to wait on fetchDoor43Story.
  const pageTitle =
    story?.title || media?.stories[storyId]?.title || engLocale?.stories?.[storyId]?.title || `Story ${storyId}`

  return (
    <div className="door43-story">
      <h1>{pageTitle}</h1>

      {state === "loading" && <p>Loading…</p>}

      {state === "no-language" && (
        <p>
          This story isn't available yet in the selected language ({selectedLang}). Try switching
          languages.
        </p>
      )}

      {state === "error" && <p>Couldn't load this story from door43 — please try again.</p>}

      {state === "ready" && story && (
        <>
          {audioUrl && (
            <audio
              ref={audioRef}
              src={audioUrl}
              controls
              onTimeUpdate={handleTimeUpdate}
              style={{ width: "100%", marginBottom: "1rem" }}
            />
          )}

          {story.sections.map((section, i) => (
            <div
              className={`door43-section${activeSegment === i + 1 ? " active" : ""}`}
              key={i}
              onClick={audioUrl && storyTiming ? () => seekToSegment(i) : undefined}
              style={audioUrl && storyTiming ? { cursor: "pointer" } : undefined}
            >
              <img src={section.imageUrl} alt="" loading="lazy" />
              {section.text && <p>{section.text}</p>}
            </div>
          ))}
          {story.bibleReference && <p className="door43-reference">{story.bibleReference}</p>}
        </>
      )}
    </div>
  )
}
