import { useState, useEffect, useRef, useCallback } from "react"
import { useStore } from "@nanostores/react"
import {
  $selectedLanguage,
  $secondaryLanguages,
  $selectedLanguages,
  $engIsExplicit,
  $languageNames,
  loadLanguageData,
  loadLanguageNames,
} from "../stores/language-store"
import { $chapterText, loadChapter } from "../stores/chapter-store"
import {
  $currentVerseEntries,
  $focusMode,
  $audioPageStory,
  $audioToast,
  playVerse,
  setAudioForChapter,
  unlockAudio,
  type VerseEntry,
} from "../stores/audio-store"
import { playScene, setVideoForChapter } from "../stores/video-store"
import { parseMarkdownIntoSections } from "../lib/bw/markdown-parser"
import { parseReference, splitReference, getTestament } from "../lib/bw/bible-utils"
import { parseTextFilesetId, parseAudioFilesetId } from "../lib/bw/fileset-utils"
import StorySection from "./StorySection"
import { buildLangHref } from "../lib/bw/url-utils"
import type { Section, LocaleData, ImageConfig } from "../lib/bw/types"
import { resolveImageUrl, resolveMediumUrl } from "../lib/bw/image-utils"
import { shouldProbePkf } from "../lib/bw/language-list"
import { loadLanguageMedia, loadBookTiming, availabilityFor } from "../lib/bw/dbt-media"
import { loadVernacularFontFace } from "../lib/bw/vernacular-font"
import { pkfUrl } from "../lib/bw/pkf-url"
import { loadObsMedia, fetchDoor43Story, loadObsProducedTiming, loadObsProducedAudioBlobUrl, type Door43Story } from "../lib/bw/door43-obs"
import languageStyles from "../data/language-styles.json"
import languagePreferences from "../data/language-preferences.json"

interface Props {
  templateName: string
  categoryId: string
  storyId: string
  engLocale: LocaleData | null
  markdownContent: string
  /** Per-language scene prose, resolved via [[body:storyId.sceneId]]
   *  markers in markdownContent — set only for templates whose story text
   *  isn't scripture and so has no existing live per-language source (see
   *  the "test" template and loadSceneBodyText). Falls back to its own
   *  "eng" entry for any other selected language. markdownContent itself
   *  stays shared/language-invariant either way, same as every other
   *  template — only the resolved body text varies per language. */
  sceneBodies?: Record<string, Record<string, string>> | null
  /** Chapter-video availability per language (see the "test" template) —
   *  {videoUrl, timingUrl} for every ISO that has a real video + matching
   *  scene-timing file. The selected reading language's video is preferred;
   *  when it has none (today, only "kir" does), falls back to whichever
   *  language IS available — see resolveVideoInfo below. */
  videoByLang?: Record<string, { videoUrl: string; timingUrl: string }> | null
  allLocales: Record<string, LocaleData>
  imageConfig?: ImageConfig | null
  /** True for templates with a `[produced]` section (currently only OBS) —
   *  real, purpose-made per-language text/audio is checked live per
   *  section and overlaid onto the normal markdownContent-driven sections
   *  wherever it exists for a given language, without changing anything
   *  else about how this component renders. See src/lib/bw/door43-obs.ts. */
  producedContent?: boolean
}

export default function StoryReaderIsland({
  templateName,
  categoryId,
  storyId,
  engLocale,
  markdownContent,
  sceneBodies = null,
  videoByLang = null,
  allLocales,
  imageConfig = null,
  producedContent = false,
}: Props) {
  const selectedLang = useStore($selectedLanguage)
  const secondaryLangs = useStore($secondaryLanguages)
  const selectedLangs = useStore($selectedLanguages)
  const engIsExplicit = useStore($engIsExplicit)
  const chapterText = useStore($chapterText)
  const audioPageStory = useStore($audioPageStory)

  const thisPageStory = `${templateName}/${categoryId}/${storyId}`
  const isOnAudioPage = audioPageStory === thisPageStory

  // Resolve scene-body text for a given language: sceneBodies[lang] when
  // this template has per-language prose, falling back to its own "eng"
  // entry, else {} (harmless — [[body:...]] markers just resolve to
  // nothing for every other template, which never contain that marker).
  const sceneBodiesForLang = useCallback(
    (lang: string): Record<string, string> => sceneBodies?.[lang] ?? sceneBodies?.eng ?? {},
    [sceneBodies],
  )

  const [hydrated, setHydrated] = useState(false)
  const markdown = markdownContent
  const [localeData, setLocaleData] = useState<Record<string, any> | null>(null)
  const [loading] = useState(false)
  const [error] = useState<string | null>(markdownContent ? null : "Story not found")
  const [audioWarning, setAudioWarning] = useState<string | null>(null)
  const [textWarning, setTextWarning] = useState<string | null>(null)
  const [audioLang, setAudioLang] = useState<string | null>(null)
  const [videoSceneEntries, setVideoSceneEntries] = useState<VerseEntry[] | null>(null)
  const [producedStories, setProducedStories] = useState<Record<string, Door43Story | null>>({})

  // Prefer the selected reading language's video; fall back to whichever
  // language actually has one (today, only "kir" does — more will be added
  // over time, and this needs no code change when they are).
  const videoInfo = videoByLang
    ? videoByLang[selectedLang] ?? videoByLang[Object.keys(videoByLang)[0]] ?? null
    : null
  const audioSetupPromise = useRef<Promise<void> | null>(null)

  useEffect(() => setHydrated(true), [])

  // Fetch this chapter's per-scene [start, end] timing and hand it to
  // video-store, once — this is entirely independent of the Bible-verse
  // audio setup below (no [[ref:...]] markers in this content, so that
  // effect naturally no-ops for video-driven templates).
  useEffect(() => {
    if (!videoInfo) { setVideoSceneEntries(null); return }
    let cancelled = false
    fetch(videoInfo.timingUrl)
      .then((r) => (r.ok ? r.json() : null))
      .then((timing: Record<string, [number, number]> | null) => {
        if (cancelled || !timing) return
        const sceneIds = Object.keys(timing).sort()
        const entries: VerseEntry[] = sceneIds.map((sceneId, i) => {
          const [start, end] = timing[sceneId]
          return { verseStart: i + 1, verseEnd: i + 1, startTime: start, endTime: end, sectionIndex: i }
        })
        setVideoSceneEntries(entries)
        const title = parseMarkdownIntoSections(markdown, {}, localeData, engLocale).title
        setVideoForChapter({ storyKey: thisPageStory, title, videoUrl: videoInfo.videoUrl, sceneEntries: entries })
      })
      .catch(() => setVideoSceneEntries(null))
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [videoInfo?.videoUrl, videoInfo?.timingUrl, thisPageStory])

  // Produced (real, purpose-made door43/OBS-TLF) story text, per rendered
  // language — checked live and overlaid section-by-section onto the local
  // reconstructed sections below wherever it exists for that language.
  // storyId doubles as door43's own OBS story id (both derived from the
  // same "01".."50" numbering, global across categories).
  useEffect(() => {
    if (!producedContent) {
      setProducedStories({})
      return
    }
    let cancelled = false
    Promise.all(
      selectedLangs.map(async (lang) => {
        const media = await loadObsMedia(lang)
        if (!media) return [lang, null] as const
        const story = await fetchDoor43Story(media, storyId)
        return [lang, story] as const
      }),
    ).then((pairs) => {
      if (cancelled) return
      setProducedStories(Object.fromEntries(pairs))
    })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [producedContent, storyId, selectedLangs.join(",")])

  // Eagerly start downloading produced audio, if any, as soon as the story
  // loads — well before the user clicks a section. git.door43.org's
  // release-download host (where OBS-TLF audio is hosted) doesn't support
  // HTTP Range requests (confirmed: a Range header gets ignored, full 200
  // + full body every time), so a browser <audio> element can't seek to an
  // arbitrary position until the WHOLE file has downloaded — clicking a
  // later section before that finishes silently fails to seek and keeps
  // playing from wherever it already was. Warming the browser's HTTP cache
  // here means that, by the time someone actually clicks around, the file
  // (only a few MB) is very likely already fully buffered and seeking
  // works normally, instead of only working after the first click has sat
  // long enough for the whole file to finish loading on its own.
  useEffect(() => {
    if (!producedContent) return
    let cancelled = false
    ;(async () => {
      const media = await loadObsMedia(selectedLangs[0])
      const audioUrl = media?.stories[storyId]?.audio_url
      if (audioUrl && !cancelled) loadObsProducedAudioBlobUrl(selectedLangs[0], storyId, audioUrl)
    })()
    return () => {
      cancelled = true
    }
  }, [producedContent, storyId, selectedLangs[0]])

  const handleVideoSectionClick = (sectionIndex: number) => {
    if (!videoSceneEntries) return
    unlockAudio()
    const idx = videoSceneEntries.findIndex((e) => e.sectionIndex === sectionIndex)
    if (idx < 0) return
    // playScene() FIRST — it sets $playerMediaKind to "video" synchronously,
    // and $focusMode.set(true) below fires populateFocusPanel synchronously
    // too (nanostores subscribers run immediately, not on a microtask), so
    // the order here matters: flipping media-kind after focus mode was
    // already activated meant the very first click always rendered the
    // Ken-Burns image branch instead of the video.
    playScene(idx)
    // Same "already in focus mode" workaround as handleSectionClick: setting
    // an atom to its current value doesn't fire subscribers, so clicking a
    // different section while already focused needs an explicit nudge.
    if ($focusMode.get()) {
      window.dispatchEvent(new CustomEvent("focus-panel-refresh", { detail: { idx: sectionIndex } }))
    } else {
      $focusMode.set(true)
    }
  }

  const isVideoSection = (sectionIndex: number) =>
    !!videoSceneEntries?.some((e) => e.sectionIndex === sectionIndex)

  // Apply per-language font and gap scaling
  useEffect(() => {
    const styles = languageStyles as Record<string, { fontScale?: number; gapScale?: number }>
    const primary = styles[selectedLang]
    const secondary = secondaryLangs.length > 0 ? styles[secondaryLangs[0]] : undefined
    document.documentElement.style.setProperty("--primary-font-scale", String(primary?.fontScale ?? 1))
    document.documentElement.style.setProperty("--secondary-font-scale", String(secondary?.fontScale ?? 1))
    document.documentElement.style.setProperty("--primary-gap-scale", String(primary?.gapScale ?? 1))
  }, [selectedLang, secondaryLangs])

  // Vernacular fonts for the primary/secondary text, if the CDN ships real
  // @font-face for this language (see vernacular-font.ts for why this can't
  // just reuse the Bible reader's bundle.css <link> swap — two languages can
  // be on screen at once here).
  useEffect(() => {
    let cancelled = false
    loadVernacularFontFace(selectedLang).then((family) => {
      if (!cancelled) {
        document.documentElement.style.setProperty("--primary-font-family", family ?? "inherit")
      }
    })
    return () => {
      cancelled = true
    }
  }, [selectedLang])

  useEffect(() => {
    const secondaryIso = secondaryLangs[0]
    if (!secondaryIso) {
      document.documentElement.style.setProperty("--secondary-font-family", "inherit")
      return
    }
    let cancelled = false
    loadVernacularFontFace(secondaryIso).then((family) => {
      if (!cancelled) {
        document.documentElement.style.setProperty("--secondary-font-family", family ?? "inherit")
      }
    })
    return () => {
      cancelled = true
    }
  }, [secondaryLangs])

  // Load locale data for current language from build-time data
  useEffect(() => {
    if (allLocales[selectedLang]) {
      setLocaleData(allLocales[selectedLang] as Record<string, any>)
    } else {
      setLocaleData(null)
    }
  }, [selectedLang, allLocales])

  // Load language data and chapter text for all active languages
  useEffect(() => {
    if (!markdown) return

    const hasProducedAudio = async (lang: string): Promise<boolean> => {
      if (!producedContent) return false
      const media = await loadObsMedia(lang)
      return !!media?.stories[storyId]?.audio_url
    }

    const loadAllLanguages = async () => {
      const tempSections = parseMarkdownIntoSections(markdown)
      const refs = new Set<string>()
      const neededTestaments = new Set<string>()
      for (const section of tempSections.sections) {
        if (section.reference) {
          for (const ref of splitReference(section.reference)) {
            const parsed = parseReference(ref)
            if (parsed) {
              refs.add(`${parsed.book}.${parsed.chapter}`)
              neededTestaments.add(getTestament(parsed.book))
            }
          }
        }
      }

      // Check if primary language has timed audio for required testaments
      const TIMING_CATS = ["with-timecode", "audio-with-timecode"]
      const primaryLangData = await loadLanguageData(selectedLangs[0])
      let primaryHasTimedAudio = primaryLangData
        && TIMING_CATS.includes(primaryLangData.category)
        && !(neededTestaments.has("ot") && primaryLangData.canon === "nt")

      // Produced (real, purpose-made) narration audio counts as "timed
      // audio" too — checked independently of testament, since it has
      // nothing to do with Bible canon coverage (ensureAudioSetup tries it
      // first). Without this, a language with e.g. NT-only DBT audio but
      // full produced OBS audio would show "no timed audio" and disable
      // clicking entirely for OT stories, even though produced audio for
      // that story exists and would otherwise play fine.
      if (!primaryHasTimedAudio) {
        primaryHasTimedAudio = await hasProducedAudio(selectedLangs[0])
      }

      // Also check the CDN's live per-language media index (audio/timing
      // availability per canon) — see src/lib/bw/dbt-media.ts.
      if (!primaryHasTimedAudio) {
        const avail = await availabilityFor(selectedLangs[0])
        for (const canon of ["nt", "ot"] as const) {
          if (!neededTestaments.has(canon)) continue
          if (avail?.[canon]?.timing) {
            primaryHasTimedAudio = true
            break
          }
        }
      }

      // Also check PKF audio data (Scripture Earth)
      if (!primaryHasTimedAudio) {
        const pkfMedia = await loadPkfMedia(selectedLangs[0])
        if (pkfMedia?.audio?.items?.length > 0) {
          primaryHasTimedAudio = true
        }
      }

      if (primaryHasTimedAudio) {
        setAudioLang(selectedLangs[0])
        setAudioWarning(null)
      } else {
        // Look for a secondary language with timed audio
        await loadLanguageNames()
        let fallbackLang: string | null = null
        for (const lang of selectedLangs.slice(1)) {
          const langData = await loadLanguageData(lang)
          let hasAudio = langData && TIMING_CATS.includes(langData.category)
            && !(neededTestaments.has("ot") && langData.canon === "nt")
          if (!hasAudio) hasAudio = await hasProducedAudio(lang)
          if (!hasAudio) {
            const avail = await availabilityFor(lang)
            for (const canon of ["nt", "ot"] as const) {
              if (!neededTestaments.has(canon)) continue
              if (avail?.[canon]?.timing) { hasAudio = true; break }
            }
          }
          if (!hasAudio) {
            const pkfMedia = await loadPkfMedia(lang)
            if (pkfMedia?.audio?.items?.length > 0) hasAudio = true
          }
          if (hasAudio) {
            fallbackLang = lang
            break
          }
        }

        if (fallbackLang) {
          setAudioLang(fallbackLang)
          const names = $languageNames.get()
          const fallbackName = names[fallbackLang]?.n || fallbackLang.toUpperCase()
          setAudioWarning(`No timed audio for primary language — using ${fallbackName} for audio`)
        } else {
          setAudioLang(null)
          setAudioWarning("No timed audio available — audio playback disabled")
        }
      }

      // Load text for all selected languages, using canon-specific fileset IDs
      let primaryHasText = false
      for (const lang of selectedLangs) {
        const langData = await loadLanguageData(lang)
        if (!langData?.data) continue

        // Build text fileset IDs per canon. Only fall back to the
        // language's single "best" fileset for a canon it doesn't have its
        // own canonData entry for when that fileset actually covers both
        // testaments ("full") — otherwise an NT-only (or OT-only) language
        // would silently inherit the wrong canon's fileset id here and
        // 404 trying to fetch a book that fileset never contains.
        const canonData = langData.canonData as Record<string, any> | undefined
        const canonCoversFull = langData.canon === "full"
        const ntTextId = parseTextFilesetId(
          canonData?.nt?.data?.t || (canonCoversFull ? langData.data?.t : undefined),
          canonData?.nt?.distinctId || (canonCoversFull ? langData.distinctId : undefined),
        )
        const otTextId = parseTextFilesetId(
          canonData?.ot?.data?.t || (canonCoversFull ? langData.data?.t : undefined),
          canonData?.ot?.distinctId || (canonCoversFull ? langData.distinctId : undefined),
        )

        if (!ntTextId && !otTextId) continue
        if (lang === selectedLangs[0]) primaryHasText = true

        for (const refKey of refs) {
          const [book, chapter] = refKey.split(".")
          const testament = getTestament(book)
          const textFilesetId = testament === "ot"
            ? (otTextId || (canonCoversFull ? ntTextId : null))
            : (ntTextId || (canonCoversFull ? otTextId : null))
          if (textFilesetId) {
            await loadChapter(book, parseInt(chapter, 10), textFilesetId, lang)
          }
        }
      }

      setTextWarning(null)
    }
    loadAllLanguages()
  }, [markdown, selectedLangs.join(","), engIsExplicit, producedContent, storyId])

  // Ensure audio context is set up (called on-demand before playing)
  const ensureAudioSetup = useCallback(async () => {
    if (!audioLang) return // Audio disabled — no language has timed audio
    if (audioSetupPromise.current) return audioSetupPromise.current

    audioSetupPromise.current = (async () => {
      // Produced (real, purpose-made) narration audio takes precedence over
      // the reconstructed Bible-verse audio below, independently of whether
      // produced TEXT also exists for this language — see the [produced]
      // doc comment in OBS/index.toml. Falls through to the verse-audio
      // path below when there's no produced audio for audioLang.
      if (producedContent) {
        const media = await loadObsMedia(audioLang)
        const rawAudioUrl = media?.stories[storyId]?.audio_url
        if (media && rawAudioUrl) {
          // Use a local blob: URL instead of the remote one — see
          // loadObsProducedAudioBlobUrl's comment for why (git.door43.org's
          // release-download host doesn't support HTTP Range requests, so
          // the raw URL can't be seeked into until it's fully downloaded).
          const audioUrl = (await loadObsProducedAudioBlobUrl(audioLang, storyId, rawAudioUrl)) || rawAudioUrl
          const timing = await loadObsProducedTiming(audioLang, storyId)
          const tempSections = parseMarkdownIntoSections(markdown, {}, localeData, engLocale, sceneBodiesForLang(selectedLang))
          overlayProducedText(tempSections.sections, producedStories[audioLang] ?? null)
          const verseEntries: VerseEntry[] = tempSections.sections.map((section, i) => {
            const seg = timing?.[String(i + 1)]
            const sectionImageUrl = section.imageUrls.length > 0
              ? resolveMediumUrl(section.imageUrls[0], imageConfig, 640)
              : null
            return {
              verseStart: i + 1, verseEnd: i + 1,
              startTime: seg ? seg[0] : 0,
              endTime: seg ? seg[1] : 0,
              audioUrl,
              sectionIndex: i,
              imageUrl: sectionImageUrl,
            }
          })
          // Same zero-duration fallback as the reconstructed-audio path
          // below — a segment with no published timing yet (or the last
          // segment, which has no following boundary) plays through to the
          // next segment's start, or 30s if there is none.
          for (let i = 0; i < verseEntries.length; i++) {
            const e = verseEntries[i]
            if (e.startTime >= e.endTime) {
              const next = verseEntries[i + 1]
              e.endTime = next ? next.startTime : e.startTime + 30
            }
          }
          // Produced-audio diagnostics — enable by adding ?audiodebug to the
          // URL. Mirrors the reconstructed-audio debug block below.
          if (typeof window !== "undefined" && window.location.search.includes("audiodebug")) {
            console.group(`[audiodebug/produced] ${templateName} / ${categoryId}/${storyId} · lang=${audioLang}`)
            console.log("audioUrl:", audioUrl)
            console.log("timing fetched:", timing)
            console.log("verse entries (section · time):")
            for (const e of verseEntries) {
              console.log(`  §${e.sectionIndex}  t=${e.startTime.toFixed(2)}–${e.endTime.toFixed(2)}s`)
            }
            console.groupEnd()
          }

          setAudioForChapter({
            distinctId: "",
            bookCode: "",
            chapter: 0,
            bookName: templateName,
            audioUrl,
            verseEntries,
          })
          return
        }
      }

      const langData = await loadLanguageData(audioLang)

      const tempSections = parseMarkdownIntoSections(markdown, {}, localeData, engLocale)

      // Collect all unique book+chapter combinations from sections
      const chapterRefs = new Map<string, { book: string; chapter: number }>()
      const neededBooks = new Set<string>()
      for (const section of tempSections.sections) {
        if (!section.reference) continue
        for (const ref of splitReference(section.reference)) {
          const p = parseReference(ref)
          if (p) {
            const key = `${p.book}.${p.chapter}`
            if (!chapterRefs.has(key)) chapterRefs.set(key, { book: p.book, chapter: p.chapter })
            neededBooks.add(p.book)
          }
        }
      }

      // Determine which canon each book belongs to, so we use the right fileset
      const neededTestaments = new Set<string>()
      for (const book of neededBooks) {
        neededTestaments.add(getTestament(book))
      }

      // Get canon-specific data for audio fileset IDs
      const canonData = langData?.canonData as Record<string, any> | undefined
      const getCanonLangData = (testament: string) => {
        if (canonData?.[testament]) return canonData[testament]
        return langData
      }

      // Build audio fileset IDs per canon, respecting language preferences
      const audioFilesetIds: Record<string, string> = {}
      const prefRaw = (languagePreferences as Record<string, any>)[audioLang]?.preferredFileset
      const getPreferred = (canon: string): string | null => {
        if (!prefRaw) return null
        if (typeof prefRaw === "string") return prefRaw
        return prefRaw[canon] || null
      }

      for (const testament of neededTestaments) {
        const cData = getCanonLangData(testament)
        if (cData?.data) {
          const distinctId = getPreferred(testament) || cData.distinctId
          const id = parseAudioFilesetId(cData.data?.a, distinctId)

          if (id) audioFilesetIds[testament] = id
        }
      }

      // Does this language have any live-CDN timed audio at all, for the
      // canon(s) this story actually needs? (src/lib/bw/dbt-media.ts's
      // global media-index — one cheap, cached fetch, not a per-book probe.)
      let hasTemplateInfo = false
      if (audioLang) {
        const avail = await availabilityFor(audioLang)
        for (const canon of neededTestaments) {
          if (avail?.[canon as "nt" | "ot"]?.timing) hasTemplateInfo = true
        }
      }

      // Need at least one audio fileset
      if (Object.keys(audioFilesetIds).length === 0) {
        if (!hasTemplateInfo) return
      }

      // Fetch timing data. PKF (Scripture Earth) languages carry their own
      // timing, so prefer it and skip the live-DBT path entirely — avoids a
      // spurious timing fetch for pkf languages.
      let timingData = null
      // `timingResult` (with DBT fileset IDs + which books resolved) only
      // comes from the live-DBT path; null for pkf languages, whose audio
      // uses info.json media items directly.
      let timingResult: Awaited<ReturnType<typeof fetchTimingData>> | null = null
      if (audioLang && (await shouldProbePkf(audioLang))) {
        const pkfTiming = await fetchPkfTimingData(audioLang, [...neededBooks])
        if (pkfTiming) timingData = pkfTiming
      }

      // Fall back to live DBT timing (cdn.bibel.wiki/dbt/<iso>/timing/<BOOK>.json)
      // for non-pkf languages (or pkf langs that turned out to have none).
      let booksWithTiming = new Set<string>()
      if (!timingData && audioLang) {
        timingResult = await fetchTimingData(audioLang, [...neededBooks], audioFilesetIds)
        timingData = timingResult?.data || null
        booksWithTiming = timingResult?.books ?? new Set()
      }

      // Use fileset IDs from timing data for audio fetch (ensures timing/audio match)
      if (timingResult?.filesetIds) {
        for (const [canon, fsId] of Object.entries(timingResult.filesetIds)) {
          const prev = audioFilesetIds[canon]
          if (prev && prev !== fsId) {
            console.warn(
              `[audio] Fileset mismatch for ${canon}/${audioLang}: ` +
              `language data suggested "${prev}" but timing data requires "${fsId}". ` +
              `Using timing fileset to ensure timestamps match audio.`
            )
          }
          audioFilesetIds[canon] = fsId
        }
      }

      // Fetch audio URLs for all chapters in parallel, using canon-appropriate
      // fileset. Only attempt books that actually resolved real timing (the
      // PKF path leaves booksWithTiming empty, so it never filters there —
      // same permissive behavior the old per-language manifest had for PKF).
      const audioUrlMap = new Map<string, string | null>()
      await Promise.all(
        [...chapterRefs.entries()].map(async ([key, { book, chapter }]) => {
          if (booksWithTiming.size > 0 && !booksWithTiming.has(book)) {
            audioUrlMap.set(key, null)
            return
          }
          const testament = getTestament(book)
          const filesetId = audioFilesetIds[testament] || Object.values(audioFilesetIds)[0]
          if (!filesetId) { audioUrlMap.set(key, null); return }
          const url = await fetchAudioUrl(filesetId, book, chapter, audioLang || undefined)
          audioUrlMap.set(key, url)
        }),
      )

      // Build verse entries: expand multi-reference sections into separate entries
      // that share the same sectionIndex, so audio plays each reference sequentially
      // while the UI keeps the same section highlighted.
      const firstParsed = chapterRefs.values().next().value
      const verseEntries: import("../stores/audio-store").VerseEntry[] = []

      // Group split references by book+chapter for sequential playback
      for (let sectionIdx = 0; sectionIdx < tempSections.sections.length; sectionIdx++) {
        const section = tempSections.sections[sectionIdx]
        const sectionImageUrl = section.imageUrls.length > 0
          ? resolveMediumUrl(section.imageUrls[0], imageConfig, 640)
          : null
        if (!section.reference) {
          verseEntries.push({
            verseStart: 0, verseEnd: 0, startTime: 0, endTime: 0,
            audioUrl: null, sectionIndex: sectionIdx,
            imageUrl: sectionImageUrl,
          })
          continue
        }

        const refs = splitReference(section.reference)

        // Group consecutive refs that share the same book+chapter into one entry,
        // but create a new entry when the book+chapter changes.
        let currentChapterKey = ""
        let currentBook = ""
        let currentChapter = 0
        let startTime = Infinity
        let endTime = 0
        let vs = 0
        let ve = 0

        for (const ref of refs) {
          const p = parseReference(ref)
          if (!p) continue
          const chapterKey = `${p.book}.${p.chapter}`
          const isNewChapter = chapterKey !== currentChapterKey && currentChapterKey !== ""
          // Detect non-contiguous verses in same chapter (e.g., v5 then v14)
          const isGap = !isNewChapter && currentChapterKey !== "" && ve > 0 && (p.verseStart || 1) > ve + 1

          if (isNewChapter || isGap) {
            // Flush previous group as an entry
            verseEntries.push({
              verseStart: vs, verseEnd: ve,
              startTime: startTime === Infinity ? 0 : startTime,
              endTime,
              audioUrl: audioUrlMap.get(currentChapterKey) || null,
              sectionIndex: sectionIdx,
              bookCode: currentBook,
              chapter: currentChapter,
              imageUrl: sectionImageUrl,
            })
            startTime = Infinity
            endTime = 0
            vs = 0
            ve = 0
          }

          currentChapterKey = chapterKey
          currentBook = p.book
          currentChapter = p.chapter
          const refTestament = getTestament(p.book)
          const refFilesetId = audioFilesetIds[refTestament] || Object.values(audioFilesetIds)[0] || ""
          const timing = findTimingForReference(timingData, refFilesetId, ref)
          if (timing) {
            startTime = Math.min(startTime, timing.startTime)
            endTime = Math.max(endTime, timing.endTime)
          }
          if (!vs) { vs = p.verseStart || 1; ve = p.verseEnd || vs }
          else { ve = p.verseEnd || p.verseStart || ve }
        }

        // Flush last group
        if (currentChapterKey) {
          verseEntries.push({
            verseStart: vs, verseEnd: ve,
            startTime: startTime === Infinity ? 0 : startTime,
            endTime,
            audioUrl: audioUrlMap.get(currentChapterKey) || null,
            sectionIndex: sectionIdx,
            bookCode: currentBook,
            chapter: currentChapter,
            imageUrl: sectionImageUrl,
          })
        } else {
          verseEntries.push({
            verseStart: 0, verseEnd: 0, startTime: 0, endTime: 0,
            audioUrl: null, sectionIndex: sectionIdx,
            imageUrl: sectionImageUrl,
          })
        }
      }

      // Fix zero-duration entries (verse missing from timing data)
      for (let i = 0; i < verseEntries.length; i++) {
        const e = verseEntries[i]
        if (e.audioUrl && e.startTime >= e.endTime) {
          // Extend to next entry's start, or add 30s default
          const next = verseEntries.slice(i + 1).find((n) => n.audioUrl === e.audioUrl && n.startTime > e.startTime)
          e.endTime = next ? next.startTime : e.startTime + 30
        }
      }

      const primaryUrl = verseEntries.find((e) => e.audioUrl)?.audioUrl || null

      // Audio diagnostics — enable by adding ?audiodebug to the URL.
      if (typeof window !== "undefined" && window.location.search.includes("audiodebug")) {
        console.group(`[audiodebug] ${templateName} / ${categoryId}/${storyId} · lang=${audioLang}`)
        console.log("chapter refs → audio URL:")
        for (const [key, { book, chapter }] of chapterRefs.entries()) {
          console.log(`  ${book} ${chapter}  →  ${audioUrlMap.get(key) ?? "(none)"}`)
        }
        console.log("verse entries (section · book ch:verses · time · audio file):")
        for (const e of verseEntries) {
          if (!e.audioUrl && !e.startTime) continue
          const file = e.audioUrl ? e.audioUrl.split("/").pop() : "(none)"
          console.log(
            `  §${e.sectionIndex} ${e.bookCode ?? "?"} ${e.chapter ?? "?"}:${e.verseStart}-${e.verseEnd}` +
            `  t=${e.startTime.toFixed(1)}–${e.endTime.toFixed(1)}s  ${file}`,
          )
        }
        console.groupEnd()
      }

      setAudioForChapter({
        distinctId: langData?.distinctId || "",
        bookCode: firstParsed?.book || "",
        chapter: firstParsed?.chapter || 0,
        bookName: templateName,
        audioUrl: primaryUrl,
        verseEntries,
      })
    })()

    return audioSetupPromise.current
  }, [audioLang, templateName, markdown, producedContent, storyId, producedStories])

  // Reset audio setup when audio language or content changes
  useEffect(() => {
    audioSetupPromise.current = null
  }, [audioLang, templateName, markdown, producedStories])

  // Build sections map per language
  const sectionsMap: Record<string, Section[]> = {}
  // Determine which languages to render text for
  const langsToRender = [...selectedLangs]
  for (const lang of langsToRender) {
    const langChapterText: Record<string, any> = {}
    for (const [key, value] of Object.entries(chapterText)) {
      if (key.startsWith(`${lang}-`)) {
        langChapterText[key.replace(`${lang}-`, "")] = value
      }
    }
    const parsed = parseMarkdownIntoSections(markdown, langChapterText, localeData, engLocale, sceneBodiesForLang(lang))
    overlayProducedText(parsed.sections, producedStories[lang])
    sectionsMap[lang] = parsed.sections
  }

  const primaryParsed = parseMarkdownIntoSections(markdown, {}, localeData, engLocale, sceneBodiesForLang(selectedLang))
  const primaryProduced = producedStories[selectedLang]
  overlayProducedText(primaryParsed.sections, primaryProduced)
  const storyTitle = primaryProduced?.title || primaryParsed.title || ""

  const handleSectionClick = (sectionIndex: number) => {
    if (!audioLang) return // Audio disabled
    unlockAudio()
    $audioPageStory.set(`${templateName}/${categoryId}/${storyId}`)
    // Ensure focus mode activates even if already true
    if ($focusMode.get()) {
      window.dispatchEvent(new CustomEvent("focus-panel-refresh", { detail: { idx: sectionIndex } }))
    } else {
      $focusMode.set(true)
    }
    ensureAudioSetup().then(() => {
      // Find the first verse entry for this visual section that has timing
      const entries = $currentVerseEntries.get()
      const entryIdx = entries.findIndex(
        (e) => e.sectionIndex === sectionIndex && e.audioUrl,
      )
      if (typeof window !== "undefined" && window.location.search.includes("audiodebug")) {
        console.log(`[audiodebug/click] sectionIndex=${sectionIndex} -> entryIdx=${entryIdx}`)
      }
      if (entryIdx >= 0) {
        playVerse(entryIdx)
      } else {
        // No timing for this section — show toast and exit focus mode
        $audioToast.set("noTimingAvailable")
        $focusMode.set(false)
      }
      if ($focusMode.get()) {
        requestAnimationFrame(() => {
          if ($focusMode.get()) {
            window.dispatchEvent(new CustomEvent("focus-panel-refresh", { detail: { idx: sectionIndex } }))
          }
        })
      }
    })
  }

  const backHref = hydrated
    ? buildLangHref(selectedLang, `${templateName}/`, secondaryLangs)
    : `/${templateName}/`

  if (loading) {
    return (
      <div>
        <div className="mb-4">
          <a href={backHref} className="text-lg font-bold" style={{ color: "var(--text)" }}>&larr;</a>
        </div>
        <div className="flex items-center justify-center py-12">
          <div className="text-gray-500">Loading story...</div>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div>
        <div className="mb-4">
          <a href={backHref} className="text-lg font-bold" style={{ color: "var(--text)" }}>&larr;</a>
        </div>
        <div className="text-center py-12">
          <h2 className="text-lg font-semibold text-red-600 mb-2">Story Not Available</h2>
          <p className="text-gray-500">{error}</p>
        </div>
      </div>
    )
  }

  const primarySections = sectionsMap[selectedLang] || primaryParsed.sections

  return (
    <div>
      <div className="flex items-center gap-3 mb-4">
        <a
          href={backHref}
          className="text-lg font-bold" style={{ color: "var(--text)" }}
        >
          &larr;
        </a>
        <h1 className="text-xl font-bold">{storyTitle}</h1>
      </div>

      {audioWarning && !videoInfo && (
        <div className="mb-4 px-3 py-2 rounded-md bg-yellow-50 dark:bg-yellow-900/30 border border-yellow-300 dark:border-yellow-700 text-yellow-800 dark:text-yellow-200 text-sm">
          {audioWarning}
        </div>
      )}

      {textWarning && (
        <div className="mb-4 px-3 py-2 rounded-md bg-blue-50 dark:bg-blue-900/30 border border-blue-300 dark:border-blue-700 text-blue-800 dark:text-blue-200 text-sm">
          {textWarning}
        </div>
      )}

      <div className="space-y-4">
        {primarySections.map((section, index) => (
          <StorySection
            key={index}
            section={section}
            sectionIndex={index}
            selectedLanguages={langsToRender}
            sectionsMap={sectionsMap}
            onSectionClick={videoInfo ? handleVideoSectionClick : handleSectionClick}
            imageConfig={imageConfig}
            isVideoSection={videoInfo ? isVideoSection : undefined}
          />
        ))}
      </div>
    </div>
  )
}

// --- Helpers ---

/**
 * Overlay produced (real, purpose-made) narration text onto the local
 * reconstructed sections, matched 1:1 by position — both are built from
 * the same door43 canonical story images, so section counts line up.
 * Images and Bible references stay local; only the words shift, and only
 * for sections where produced text actually exists (a story can have
 * fewer produced sections than local ones, e.g. an in-progress translation).
 */
function overlayProducedText(sections: Section[], produced: Door43Story | null | undefined) {
  if (!produced) return
  sections.forEach((section, i) => {
    const producedText = produced.sections[i]?.text
    if (producedText) section.text = producedText
  })
}

async function fetchPkfTimingData(
  langCode: string,
  neededBooks: string[],
): Promise<Record<string, any> | null> {
  const media = await loadPkfMedia(langCode)
  if (!media?.audio?.items) return null

  const merged: Record<string, any> = {}
  const pkfKey = `pkf_${langCode}`

  for (const book of neededBooks) {
    const chapters = new Set(
      media.audio.items
        .filter((i: any) => i.bookCode === book)
        .map((i: any) => i.chapter)
    )

    for (const chapter of chapters) {
      try {
        const resp = await fetch(pkfUrl(`/pkf/${langCode}/timing/${book}-${chapter}.json`))
        if (!resp.ok) continue
        const rows: [number, number, string][] = await resp.json()

        const verseMap: Record<string, [number, number]> = {}
        for (const [start, end, tag] of rows) {
          if (tag.startsWith("s")) continue
          const verseNum = parseInt(tag, 10)
          if (isNaN(verseNum)) continue
          const key = String(verseNum)
          if (verseMap[key]) {
            verseMap[key][0] = Math.min(verseMap[key][0], start)
            verseMap[key][1] = Math.max(verseMap[key][1], end)
          } else {
            verseMap[key] = [start, end]
          }
        }

        if (!merged[pkfKey]) merged[pkfKey] = {}
        if (!merged[pkfKey][pkfKey]) merged[pkfKey][pkfKey] = {}
        // Key by book-chapter (e.g. "MAT-2") so different books that share a
        // chapter number (MAT 2 vs LUK 2) don't collide.
        merged[pkfKey][pkfKey][`${book}-${chapter}`] = verseMap
      } catch { continue }
    }
  }

  return Object.keys(merged).length > 0 ? merged : null
}

/**
 * Live verse-timing lookup for story mode, via cdn.bibel.wiki's own
 * per-book DBT timing endpoint (src/lib/bw/dbt-media.ts's loadBookTiming) —
 * the same source config/regions/*.toml's own research already established
 * as authoritative, instead of a separate pre-baked snapshot bundled by
 * bible-story-builder (which turned out to duplicate this exact data, see
 * the investigation that led to this change: same fileset IDs, same verse
 * timings modulo minor drift from the CDN's own timing being periodically
 * re-generated after bible-story-builder's copy was taken).
 */
async function fetchTimingData(
  iso: string,
  neededBooks: string[],
  audioFilesetIds: Record<string, string>,
): Promise<{ data: Record<string, any>; filesetIds: Record<string, string>; books: Set<string> } | null> {
  const merged: Record<string, any> = {}
  // Track the actual audio fileset IDs found in timing data, keyed by canon
  const filesetIds: Record<string, string> = {}
  const books = new Set<string>()

  for (const book of neededBooks) {
    const canon = getTestament(book)
    const bookTiming = await loadBookTiming(iso, book)
    if (!bookTiming) continue

    // Prefer whichever fileset the language's own resolved audio already
    // uses (keeps timing aligned with the audio that will actually play);
    // otherwise take the first fileset this book has — arbitrary but
    // deterministic, same tie-break convention scripts/fetch-data.mjs's
    // own source-catalog resolution uses.
    const preferred = audioFilesetIds[canon]
    const fileset = preferred && bookTiming[preferred] ? preferred : Object.keys(bookTiming)[0]
    if (!fileset) continue

    books.add(book)
    if (!filesetIds[canon]) filesetIds[canon] = fileset
    if (!merged[fileset]) merged[fileset] = {}
    for (const [chapter, verses] of Object.entries(bookTiming[fileset])) {
      // Key by book-chapter ("MAT-2") so books sharing a chapter number
      // (MAT 2 vs LUK 2) don't collide when the lookup searches by chapter.
      const ck = `${book}-${chapter}`
      merged[fileset][ck] = { ...(merged[fileset][ck] ?? {}), ...verses }
    }
  }

  return Object.keys(merged).length > 0 ? { data: merged, filesetIds, books } : null
}

/**
 * Search timing data for a matching Bible reference.
 * Format: fileset → book-chapter (or bare chapter, for pkf) → verse → [start, end]
 */
function findTimingForReference(
  timingData: Record<string, any> | null,
  audioFilesetId: string,
  reference: string,
): { startTime: number; endTime: number } | null {
  if (!timingData) return null

  const parsed = parseReference(reference)
  if (!parsed) return null

  const chapter = String(parsed.chapter)
  const bookChapter = `${parsed.book}-${parsed.chapter}`
  const vs = parsed.verseStart
  if (!vs) return null
  const ve = parsed.verseEnd ?? vs

  // Search through all fileset keys — audioFilesetId is a hint, not a
  // requirement; any fileset present can match, same tolerance the
  // previous story-nested search had.
  for (const key of Object.keys(timingData)) {
    if (key === "warnings") continue
    const filesetData = timingData[key]
    if (!filesetData) continue

    // Prefer the book-chapter key (pkf); fall back to chapter-only (DBT).
    const chapterData = filesetData[bookChapter] ?? filesetData[chapter]
    if (!chapterData) continue

    // Collect start/end across all verses in the range
    let startTime = Infinity
    let endTime = 0
    let found = false

    for (let v = vs; v <= ve; v++) {
      const entry = chapterData[String(v)]
      if (Array.isArray(entry)) {
        startTime = Math.min(startTime, entry[0])
        endTime = Math.max(endTime, entry[1])
        found = true
      }
    }

    if (found) return { startTime, endTime }
  }
  return null
}

// Contrib registry: lang → { id, canon } (mirrors chapter-store.ts)
const contribRegistry: Record<string, { id: string; canon: "nt" | "ot" | "full" }> = {
  nor: { id: "NBS", canon: "nt" },
}

const pkfAudioCache = new Map<string, any>()

// DBT proxy availability — detected lazily on first real request
let _dbtAvailable = true
function markDbtUnavailable() { _dbtAvailable = false }
function isDbtAvailable(): boolean { return _dbtAvailable }

async function loadPkfMedia(langCode: string): Promise<any | null> {
  if (pkfAudioCache.has(langCode)) return pkfAudioCache.get(langCode)
  // BSB-only / bridge / un-fetched languages have no PKF data — skip (avoids 404).
  if (langCode === "eng" || !(await shouldProbePkf(langCode))) { pkfAudioCache.set(langCode, null); return null }
  try {
    const resp = await fetch(pkfUrl(`/pkf/${langCode}/info.json`))
    if (!resp.ok) { pkfAudioCache.set(langCode, null); return null }
    const info = await resp.json()
    const media = info?.media ?? null
    pkfAudioCache.set(langCode, media)
    return media
  } catch {
    pkfAudioCache.set(langCode, null)
    return null
  }
}

async function fetchAudioUrl(
  audioFilesetId: string,
  bookCode: string,
  chapter: number,
  langCode?: string,
): Promise<string | null> {
  // 1. Try PKF audio data (Scripture Earth)
  if (langCode) {
    const media = await loadPkfMedia(langCode)
    const items = media?.audio?.items
    if (items) {
      const item = items.find(
        (i: any) => i.bookCode === bookCode && i.chapter === chapter
      )
      if (item?.url) return item.url
    }
  }

  // 2. Try contrib audio (local files)
  if (langCode) {
    const contrib = contribRegistry[langCode]
    if (contrib) {
      const contribUrl = `/audio/${langCode}/${contrib.id}/${bookCode}_${chapter}.mp3`
      try {
        const resp = await fetch(contribUrl, { method: "HEAD" })
        if (resp.ok) {
          return contribUrl
        }
      } catch { /* fall through */ }
      if (audioFilesetId.startsWith(contrib.id)) return null
    }
  }

  // 3. Try helloao (free, no key needed)
  try {
    const helloaoResp = await fetch(
      `https://bible.helloao.org/api/${audioFilesetId}/${bookCode}/${chapter}.json`
    )
    if (helloaoResp.ok) {
      const helloaoData = await helloaoResp.json()
      const audioPath = helloaoData?.chapter?.audio?.mp3
      if (audioPath) return audioPath
    }
  } catch { /* fall through */ }

  // 4. Try DBT proxy (skip if previously returned 404)
  if (!isDbtAvailable()) return null

  const params = new URLSearchParams({
    type: "audio",
    fileset_id: audioFilesetId,
    book_id: bookCode,
    chapter_id: String(chapter),
  })
  try {
    const resp = await fetch(`/.netlify/functions/dbt-proxy?${params}`)
    if (resp.status === 404) { markDbtUnavailable(); return null }
    if (!resp.ok) return null
    const json = await resp.json()
    return json.data?.[0]?.path || null
  } catch {
    markDbtUnavailable()
    return null
  }
}

