import { describe, expect, it } from "vitest"
import { editionHasTiming, timingFromStarts, type FilesetEntry } from "./dbt-media"

describe("editionHasTiming", () => {
  const wtc: FilesetEntry = {
    id: "SPAWTC", media: "at", a: ["SPNWTCN1DA", "SPNWTCN2DA"],
    timingExcept: { SPNWTCN1DA: ["2JN", "2PE", "3JN"] },
  }
  const r95: FilesetEntry = {
    id: "SPAR95", media: "at", a: ["SPNR95N2DA", "SPNR95N2SA"],
    timingOnly: { SPNR95N2DA: ["JHN", "MAT"], SPNR95N2SA: [] },
  }

  it("is true for every book when the fileset is in neither list", () => {
    expect(editionHasTiming(wtc, "SPNWTCN2DA", "2JN")).toBe(true)
  })
  it("leaves out timingExcept's books", () => {
    expect(editionHasTiming(wtc, "SPNWTCN1DA", "2JN")).toBe(false)
    expect(editionHasTiming(wtc, "SPNWTCN1DA", "MAT")).toBe(true)
  })
  it("keeps only timingOnly's books ([] means none)", () => {
    expect(editionHasTiming(r95, "SPNR95N2DA", "JHN")).toBe(true)
    expect(editionHasTiming(r95, "SPNR95N2DA", "ROM")).toBe(false)
    expect(editionHasTiming(r95, "SPNR95N2SA", "JHN")).toBe(false)
  })
  it("is false for audio-only editions", () => {
    expect(editionHasTiming({ id: "SPADHH", media: "a" }, "SPADHHN1DA", "MAT")).toBe(false)
  })
})

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
