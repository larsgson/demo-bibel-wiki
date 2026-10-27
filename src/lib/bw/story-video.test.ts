import { describe, it, expect } from "vitest"
import {
  parseYouTubeId,
  isYouTubeUrl,
  sceneEntriesFromSegments,
  singleSceneEntries,
  sceneIndexForSection,
  debugVideoOverride,
  obsStoryVideo,
  localeStoryVideo,
  videoTimingToSegments,
  shiftSegments,
} from "./story-video"

describe("parseYouTubeId", () => {
  it.each([
    ["https://www.youtube.com/embed/RHs-mOkjXSg", "RHs-mOkjXSg"],
    ["https://www.youtube.com/watch?v=RHs-mOkjXSg&t=30s", "RHs-mOkjXSg"],
    ["https://youtu.be/RHs-mOkjXSg?t=4", "RHs-mOkjXSg"],
    ["https://m.youtube.com/shorts/RHs-mOkjXSg", "RHs-mOkjXSg"],
    ["https://www.youtube-nocookie.com/embed/RHs-mOkjXSg", "RHs-mOkjXSg"],
    ["RHs-mOkjXSg", "RHs-mOkjXSg"],
  ])("%s", (url, id) => expect(parseYouTubeId(url)).toBe(id))

  it.each([
    "https://www.youtube.com/playlist?list=PLcaGjtXr4D9kq36LRMtXLoFZ3eB9m4Drd",
    "https://cdn.bibel.wiki/video/gify/01.mp4",
    "https://www.youtube.com/watch?v=short",
    "",
    null,
  ])("rejects %s", (url) => expect(parseYouTubeId(url)).toBeNull())

  it("isYouTubeUrl wants a link, not a bare id", () => {
    expect(isYouTubeUrl("https://youtu.be/RHs-mOkjXSg")).toBe(true)
    expect(isYouTubeUrl("RHs-mOkjXSg")).toBe(false)
    expect(isYouTubeUrl("https://cdn.bibel.wiki/video/gify/01.mp4")).toBe(false)
  })
})

describe("sceneEntriesFromSegments", () => {
  it("shifts segment timing by the offset and skips untimed sections", () => {
    const entries = sceneEntriesFromSegments({ "1": [0, 4.5], "2": [4.5, 9], "4": [12, 15], "3": [9, 9] }, 4, 7)
    expect(entries.map((e) => [e.sectionIndex, e.startTime, e.endTime])).toEqual([
      [0, 7, 11.5],
      [1, 11.5, 16],
      [3, 19, 22],
    ])
  })

  it("is empty without timing", () => {
    expect(sceneEntriesFromSegments(null, 5, 3)).toEqual([])
  })
})

describe("singleSceneEntries", () => {
  it("plays to the end of the video without an end", () => {
    expect(singleSceneEntries(65)[0]).toMatchObject({ startTime: 65, endTime: Infinity, sectionIndex: 0 })
    expect(singleSceneEntries(65, 300)[0].endTime).toBe(300)
  })
})

describe("sceneIndexForSection", () => {
  const entries = sceneEntriesFromSegments({ "1": [0, 1], "2": [1, 2], "4": [3, 4] }, 4)
  it("finds the section's own scene, else the nearest earlier one", () => {
    expect(sceneIndexForSection(entries, 1)).toBe(1)
    expect(sceneIndexForSection(entries, 2)).toBe(1)
    expect(sceneIndexForSection(entries, 3)).toBe(2)
  })
  it("uses the single scene for every section", () => {
    expect(sceneIndexForSection(singleSceneEntries(0), 7)).toBe(0)
  })
  it("is -1 without scenes", () => {
    expect(sceneIndexForSection([], 0)).toBe(-1)
  })
})

describe("debugVideoOverride", () => {
  it("reads ?ytid and ?ytoffset", () => {
    expect(debugVideoOverride("?readerdebug&ytid=RHs-mOkjXSg&ytoffset=12.5")).toEqual({
      videoUrl: "https://www.youtube.com/watch?v=RHs-mOkjXSg",
      offset: 12.5,
    })
    expect(debugVideoOverride("?ytid=https%3A%2F%2Fyoutu.be%2FRHs-mOkjXSg")?.offset).toBe(0)
    expect(debugVideoOverride("?ytid=nope")).toBeNull()
    expect(debugVideoOverride("")).toBeNull()
  })
})

describe("obsStoryVideo", () => {
  it("reads youtube_id / youtube_offset of the story", () => {
    const stories = { "01": { youtube_id: "RHs-mOkjXSg", youtube_offset: 3 }, "02": { youtube_id: null } }
    expect(obsStoryVideo(stories, "01")).toEqual({ videoUrl: "https://www.youtube.com/watch?v=RHs-mOkjXSg", offset: 3 })
    expect(obsStoryVideo(stories, "02")).toBeNull()
    expect(obsStoryVideo(undefined, "01")).toBeNull()
  })
})

describe("localeStoryVideo", () => {
  const film = "https://www.youtube.com/embed/RHs-mOkjXSg"
  it("uses a story's own video", () => {
    const locale = { "01": { "02": { title: "x", video_url: "https://youtu.be/WMAfkYVlSoQ", video_end: 90 } } }
    expect(localeStoryVideo(locale, "01", "02")).toEqual({
      videoUrl: "https://www.youtube.com/watch?v=WMAfkYVlSoQ", start: 0, end: 90,
    })
  })
  it("uses the collection film only where the story gives its start", () => {
    const locale = { video_url: film, "01": { "02": { video_start: 600 }, "03": { title: "y" } } }
    expect(localeStoryVideo(locale, "01", "02")).toMatchObject({ start: 600, end: null })
    expect(localeStoryVideo(locale, "01", "03")).toBeNull()
    expect(localeStoryVideo({ video_url: film }, "01", "01")).toBeNull()
  })
})

describe("videoTimingToSegments", () => {
  it("keys segments by picture; each ends where the next begins, the last at its narration end", () => {
    // gdx story 01, shortened
    const data = { pos: [0, 34, 52.25], images: [1, 2, 3], run_bounds: [[10.5, 31.5], [36.5, 50.5], [54, 64.5]] as [number, number][] }
    expect(videoTimingToSegments(data)).toEqual({ "1": [0, 34], "2": [34, 52.25], "3": [52.25, 64.5] })
  })
  it("merges a picture shown in several segments", () => {
    expect(videoTimingToSegments({ pos: [0, 10, 20, 30], images: [1, 2, 2, 3] })).toEqual({
      "1": [0, 10], "2": [10, 30], "3": [30, 31],
    })
  })
  it("is null without positions", () => {
    expect(videoTimingToSegments({ pos: [] })).toBeNull()
    expect(videoTimingToSegments(null)).toBeNull()
  })
})

describe("shiftSegments", () => {
  it("moves video time to audio time, never below 0", () => {
    expect(shiftSegments({ "1": [2, 10], "2": [10, 20] }, -5)).toEqual({ "1": [0, 5], "2": [5, 15] })
  })
})
