import { describe, expect, it } from "vitest"
import {
  pkfItemFileset, pkfItemsForChapter, pkfOwnAudioUrl, pkfOwnId, pkfRowsToStarts, timingFromStarts,
} from "./audio-timing"

describe("timingFromStarts", () => {
  it("ends each verse where the next starts and the last at the end of the audio", () => {
    expect(timingFromStarts([["1", 6.14], ["2", 9.42], ["3", 18.28]])).toEqual({
      "1": [6.14, 9.42],
      "2": [9.42, 18.28],
      "3": [18.28, Number.POSITIVE_INFINITY],
    })
  })
  it("skips verses without a time and returns null when none has one", () => {
    expect(timingFromStarts([["1", 1], ["2", NaN], ["3", 5]])).toEqual({ "1": [1, 5], "3": [5, Infinity] })
    expect(timingFromStarts([])).toBeNull()
  })
})

describe("pkfItemFileset", () => {
  it("reads the DBT fileset from the file name forms PKF uses", () => {
    expect(pkfItemFileset({ src: "h1", filename: "B01___01_Matthew_____ACAWBTP2DA.mp3" })).toBe("ACAWBTP2DA")
    expect(pkfItemFileset({ src: "h1", filename: "B07___01_1CorinthiansADETBLN2DA.mp3" })).toBe("ADETBLN2DA")
    expect(pkfItemFileset({ src: "h2", filename: "BSNWBTN2DA_B03_LUK_001.mp3" })).toBe("BSNWBTN2DA")
    expect(pkfItemFileset({ src: "h1", filename: "B01___01_Matthew_____N1IZZTBL.mp3" })).toBe("IZZTBLN1DA")
  })
  it("is null for PKF's own audio", () => {
    expect(pkfItemFileset({ src: "a1", filename: "agg_42_MRK_01.mp3" })).toBeNull()
  })
})

describe("pkfItemsForChapter", () => {
  const items = [
    { filename: "x1.mp3", timingFile: "C01-02-MRK-01-timing.txt" },
    { filename: "x2.mp3", timingFile: "c01-02-mrk-02-timing.txt" },
    { filename: "y.mp3", bookCode: "JHN", chapter: 3 },
  ]
  it("matches by timingFile (any case), else by bookCode and chapter", () => {
    expect(pkfItemsForChapter(items, "MRK", 2).map((i) => i.filename)).toEqual(["x2.mp3"])
    expect(pkfItemsForChapter(items, "JHN", 3).map((i) => i.filename)).toEqual(["y.mp3"])
    expect(pkfItemsForChapter(items, "MRK", 3)).toEqual([])
  })
})

describe("pkfOwnAudioUrl", () => {
  it("uses url, else base_url, else scriptureearth.org, percent-encoded", () => {
    expect(pkfOwnAudioUrl("agg", {}, { url: "https://a.org/x.mp3", filename: "x.mp3" })).toBe("https://a.org/x.mp3")
    expect(pkfOwnAudioUrl("agg", { base_url: "https://www.scriptureearth.org/data/agg/audio/" }, { filename: "agg_42_MRK_01.mp3" }))
      .toBe("https://www.scriptureearth.org/data/agg/audio/agg_42_MRK_01.mp3")
    expect(pkfOwnAudioUrl("ded", {}, { filename: "Mark 1.mp3" }))
      .toBe("https://www.scriptureearth.org/data/ded/audio/Mark%201.mp3")
  })
})

describe("pkfRowsToStarts", () => {
  it("starts each verse at its first part and skips section rows", () => {
    expect(pkfRowsToStarts([[0, 4, "s1"], [4, 6, "1a"], [6, 9, "1b"], [9, 12, "2-3"], [12, 15, "4"]]))
      .toEqual([["1", 4], ["2", 9], ["4", 12]])
  })
})

it("names PKF's own edition <ISO>PKF", () => {
  expect(pkfOwnId("tee")).toBe("TEEPKF")
})
