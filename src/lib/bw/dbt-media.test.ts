import { describe, expect, it } from "vitest"
import { editionHasTiming, type FilesetEntry } from "./dbt-media"

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
