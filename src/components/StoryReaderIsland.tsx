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
} from "../stores/audio-store"
import { parseMarkdownIntoSections } from "../lib/bw/markdown-parser"
import { parseReference, splitReference, getTestament } from "../lib/bw/bible-utils"
import { parseTextFilesetId, parseAudioFilesetId } from "../lib/bw/fileset-utils"
import StorySection from "./StorySection"
import { buildLangHref } from "../lib/bw/url-utils"
import type { Section, LocaleData, ImageConfig } from "../lib/bw/types"
import { resolveImageUrl, resolveMediumUrl } from "../lib/bw/image-utils"
import languageStyles from "../data/language-styles.json"
import languagePreferences from "../data/language-preferences.json"

interface Props {
  templateName: string
  categoryId: string
  storyId: string
  engLocale: LocaleData | null
  markdownContent: string
  allLocales: Record<string, LocaleData>
  imageConfig?: ImageConfig | null
}

export default function StoryReaderIsland({
  templateName,
  categoryId,
  storyId,
  engLocale,
  markdownContent,
  allLocales,
  imageConfig = null,
}: Props) {
  const selectedLang = useStore($selectedLanguage)
  const secondaryLangs = useStore($secondaryLanguages)
  const selectedLangs = useStore($selectedLanguages)
  const engIsExplicit = useStore($engIsExplicit)
  const chapterText = useStore($chapterText)
  const audioPageStory = useStore($audioPageStory)

  const thisPageStory = `${templateName}/${categoryId}/${storyId}`
  const isOnAudioPage = audioPageStory === thisPageStory

  const [hydrated, setHydrated] = useState(false)
  const [markdown] = useState<string>(markdownContent)
  const [localeData, setLocaleData] = useState<Record<string, any> | null>(null)
  const [loading] = useState(false)
  const [error] = useState<string | null>(markdownContent ? null : "Story not found")
  const [audioWarning, setAudioWarning] = useState<string | null>(null)
  const [textWarning, setTextWarning] = useState<string | null>(null)
  const [audioLang, setAudioLang] = useState<string | null>(null)
  const audioSetupPromise = useRef<Promise<void> | null>(null)

  useEffect(() => setHydrated(true), [])

  // Apply per-language font and gap scaling
  useEffect(() => {
    const styles = languageStyles as Record<string, { fontScale?: number; gapScale?: number }>
    const primary = styles[selectedLang]
    const secondary = secondaryLangs.length > 0 ? styles[secondaryLangs[0]] : undefined
    document.documentElement.style.setProperty("--primary-font-scale", String(primary?.fontScale ?? 1))
    document.documentElement.style.setProperty("--secondary-font-scale", String(secondary?.fontScale ?? 1))
    document.documentElement.style.setProperty("--primary-gap-scale", String(primary?.gapScale ?? 1))
  }, [selectedLang, secondaryLangs])

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

      // Also check the template-specific timing manifest
      if (!primaryHasTimedAudio) {
        for (const canon of ["nt", "ot"]) {
          if (!neededTestaments.has(canon)) continue
          const info = await findTemplateTimingInfo(templateName, selectedLangs[0], canon)
          if (info) {
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
          if (!hasAudio) {
            for (const canon of ["nt", "ot"]) {
              if (!neededTestaments.has(canon)) continue
              const info = await findTemplateTimingInfo(templateName, lang, canon)
              if (info) { hasAudio = true; break }
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

        // Build text fileset IDs per canon
        const canonData = langData.canonData as Record<string, any> | undefined
        const ntTextId = parseTextFilesetId(
          canonData?.nt?.data?.t || langData.data?.t,
          canonData?.nt?.distinctId || langData.distinctId,
        )
        const otTextId = parseTextFilesetId(
          canonData?.ot?.data?.t || langData.data?.t,
          canonData?.ot?.distinctId || langData.distinctId,
        )

        if (!ntTextId && !otTextId) continue
        if (lang === selectedLangs[0]) primaryHasText = true

        for (const refKey of refs) {
          const [book, chapter] = refKey.split(".")
          const testament = getTestament(book)
          const textFilesetId = testament === "ot" ? (otTextId || ntTextId) : (ntTextId || otTextId)
          if (textFilesetId) {
            await loadChapter(book, parseInt(chapter, 10), textFilesetId, lang)
          }
        }
      }

      setTextWarning(null)
    }
    loadAllLanguages()
  }, [markdown, selectedLangs.join(","), engIsExplicit])

  // Ensure audio context is set up (called on-demand before playing)
  const ensureAudioSetup = useCallback(async () => {
    if (!audioLang) return // Audio disabled — no language has timed audio
    if (audioSetupPromise.current) return audioSetupPromise.current

    audioSetupPromise.current = (async () => {
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

      // Check template manifest for timing info per canon
      const timingIds: Record<string, string> = {}
      const timingBooks: Record<string, string[]> = {} // books with timing data per canon
      let timingCategory = langData?.category || ""
      let hasTemplateInfo = false
      for (const canon of ["nt", "ot"]) {
        const info = await findTemplateTimingInfo(templateName, audioLang, canon)
        if (info) {
          timingIds[canon] = info.distinctId
          timingBooks[canon] = info.books
          timingCategory = info.category
          hasTemplateInfo = true
        }
      }
      // Fallback to language data distinctId
      const defaultDistinctId = langData?.distinctId || ""
      if (!timingIds.nt) timingIds.nt = defaultDistinctId
      if (!timingIds.ot) timingIds.ot = defaultDistinctId

      // Need at least one audio fileset
      if (Object.keys(audioFilesetIds).length === 0) {
        if (!hasTemplateInfo) return
      }

      // Filter neededBooks to only those with timing data per the template manifest
      const booksWithTiming = [...neededBooks].filter((book) => {
        const canon = getTestament(book)
        const available = timingBooks[canon]
        return !available || available.length === 0 || available.includes(book)
      })

      // Fetch timing data
      const timingResult = await fetchTimingData(
        templateName, audioLang, timingIds, timingCategory, booksWithTiming,
      )
      let timingData = timingResult?.data || null

      // If no template timing, try PKF timing
      if (!timingData && audioLang) {
        const pkfTiming = await fetchPkfTimingData(audioLang, [...neededBooks])
        if (pkfTiming) timingData = pkfTiming
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

      // Fetch audio URLs for all chapters in parallel, using canon-appropriate fileset
      // Only attempt books that have timing data (per manifest)
      const audioUrlMap = new Map<string, string | null>()
      await Promise.all(
        [...chapterRefs.entries()].map(async ([key, { book, chapter }]) => {
          const testament = getTestament(book)
          // Skip books not in the timing manifest for this language
          const availableBooks = timingBooks[testament]
          if (availableBooks && availableBooks.length > 0 && !availableBooks.includes(book)) {
            audioUrlMap.set(key, null)
            return
          }
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

      const primaryUrl = verseEntries.find((e) => e.audioUrl)?.audioUrl || null

      setAudioForChapter({
        distinctId: langData?.distinctId || defaultDistinctId || "",
        bookCode: firstParsed?.book || "",
        chapter: firstParsed?.chapter || 0,
        bookName: templateName,
        audioUrl: primaryUrl,
        verseEntries,
      })
    })()

    return audioSetupPromise.current
  }, [audioLang, templateName, markdown])

  // Reset audio setup when audio language or content changes
  useEffect(() => {
    audioSetupPromise.current = null
  }, [audioLang, templateName, markdown])

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
    const parsed = parseMarkdownIntoSections(markdown, langChapterText, localeData, engLocale)
    sectionsMap[lang] = parsed.sections
  }

  const primaryParsed = parseMarkdownIntoSections(markdown, {}, localeData, engLocale)
  const storyTitle = primaryParsed.title || primaryParsed.description || ""

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
        (e) => e.sectionIndex === sectionIndex && e.endTime > e.startTime,
      )
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

      {audioWarning && (
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
            onSectionClick={handleSectionClick}
            imageConfig={imageConfig}
          />
        ))}
      </div>
    </div>
  )
}

// --- Helpers ---

// Cache for template timing manifests
const templateManifestCache: Record<string, any> = {}

async function loadTemplateTimingManifest(templateName: string): Promise<any> {
  if (templateManifestCache[templateName]) return templateManifestCache[templateName]
  try {
    const resp = await fetch(`/templates/${templateName}/ALL-timings/manifest.json`)
    if (!resp.ok) return null
    const data = await resp.json()
    templateManifestCache[templateName] = data
    return data
  } catch {
    return null
  }
}

/**
 * Check the template-specific timing manifest for a language.
 * Returns { distinctId, category, books } if found, or null.
 *
 * Manifest format: files > canon > lang > [{id, books}]
 */
async function findTemplateTimingInfo(
  templateName: string,
  langCode: string,
  canon: string,
): Promise<{ distinctId: string; category: string; books: string[] } | null> {
  const manifest = await loadTemplateTimingManifest(templateName)
  if (!manifest?.files?.[canon]) return null

  const langEntry = manifest.files[canon]?.[langCode]
  if (!langEntry) return null

  // New format: array of {id, books}
  if (Array.isArray(langEntry) && langEntry.length > 0) {
    // Check language preferences for a preferred fileset (supports per-canon)
    const prefRaw = (languagePreferences as Record<string, any>)[langCode]?.preferredFileset
    const prefId = typeof prefRaw === "string" ? prefRaw : prefRaw?.[canon] || null
    const preferred = prefId
      ? langEntry.find((e: any) => (e.id || e) === prefId)
      : null
    const pick = preferred || langEntry[0]
    return {
      distinctId: pick.id || pick,
      category: "with-timecode",
      books: pick.books || [],
    }
  }

  // Legacy format: object keyed by distinct ID
  if (typeof langEntry === "object") {
    const ids = Object.keys(langEntry)
    if (ids.length > 0) {
      const id = ids[0]
      return { distinctId: id, category: "with-timecode", books: langEntry[id] || [] }
    }
  }

  return null
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
        const resp = await fetch(`/pkf/${langCode}/timing/${book}-${chapter}.json`)
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
        merged[pkfKey][pkfKey][String(chapter)] = verseMap
      } catch { continue }
    }
  }

  return Object.keys(merged).length > 0 ? merged : null
}

async function fetchTimingData(
  templateName: string,
  langCode: string,
  timingIds: Record<string, string>,
  category: string,
  neededBooks: string[] = [],
): Promise<{ data: Record<string, any>; filesetIds: Record<string, string> } | null> {
  const merged: Record<string, any> = {}
  // Track the actual audio fileset IDs found in timing data, keyed by canon
  const filesetIds: Record<string, string> = {}
  // Fetch per-book timing files and merge
  // Path: {canon}/{lang}/{distinctId}/{BOOK}/timing.json
  // Each file contains: fileset > story > chapter > verse > [start, end]
  if (neededBooks.length > 0) {
    for (const book of neededBooks) {
      const canon = getTestament(book)
      const distinctId = timingIds[canon] || ""
      if (!distinctId) continue
      const url = `/templates/${templateName}/ALL-timings/${canon}/${langCode}/${distinctId}/${book}/timing.json`
      try {
        const resp = await fetch(url)
        if (!resp.ok) continue
        const data = await resp.json()
        // Deep-merge: fileset > story > chapter > verse
        for (const [fileset, stories] of Object.entries(data)) {
          if (fileset === "warnings") continue
          // Record the fileset ID from the timing data for this canon
          if (!filesetIds[canon]) filesetIds[canon] = fileset
          if (!merged[fileset]) merged[fileset] = {}
          for (const [story, chapters] of Object.entries(stories as Record<string, any>)) {
            if (!merged[fileset][story]) merged[fileset][story] = {}
            for (const [chapter, verses] of Object.entries(chapters as Record<string, any>)) {
              if (!merged[fileset][story][chapter]) merged[fileset][story][chapter] = {}
              Object.assign(merged[fileset][story][chapter], verses)
            }
          }
        }
      } catch {
        continue
      }
    }
  }

  return Object.keys(merged).length > 0 ? { data: merged, filesetIds } : null
}

/**
 * Search timing data for a matching Bible reference.
 * New format: fileset → story → chapter → verse → [start, end]
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
  const vs = parsed.verseStart
  if (!vs) return null
  const ve = parsed.verseEnd ?? vs

  // Search through all fileset keys, then all story entries
  for (const key of Object.keys(timingData)) {
    if (key === "warnings") continue
    const filesetData = timingData[key]
    if (!filesetData) continue

    for (const storyData of Object.values(filesetData) as Record<string, Record<string, any>>[]) {
      const chapterData = storyData[chapter]
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
  }
  return null
}

// Contrib registry: lang → { id, canon } (mirrors chapter-store.ts)
const contribRegistry: Record<string, { id: string; canon: "nt" | "ot" | "full" }> = {
  nor: { id: "NBS", canon: "nt" },
}

const pkfAudioCache = new Map<string, any>()

let _dbtChecked = false
let _dbtAvailable = false
async function isDbtAvailable(): Promise<boolean> {
  if (_dbtChecked) return _dbtAvailable
  _dbtChecked = true
  try {
    const r = await fetch("/.netlify/functions/dbt-proxy?type=audio&fileset_id=_probe&book_id=_&chapter_id=0")
    _dbtAvailable = r.status !== 404
  } catch { _dbtAvailable = false }
  return _dbtAvailable
}

async function loadPkfMedia(langCode: string): Promise<any | null> {
  if (pkfAudioCache.has(langCode)) return pkfAudioCache.get(langCode)
  try {
    const resp = await fetch(`/pkf/${langCode}/info.json`)
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

  // 4. Try DBT proxy (skip if not available)
  if (!await isDbtAvailable()) return null

  const params = new URLSearchParams({
    type: "audio",
    fileset_id: audioFilesetId,
    book_id: bookCode,
    chapter_id: String(chapter),
  })
  try {
    const resp = await fetch(`/.netlify/functions/dbt-proxy?${params}`)
    if (!resp.ok) return null
    const json = await resp.json()
    const url = json.data?.[0]?.path || null
    return url
  } catch {
    return null
  }
}

