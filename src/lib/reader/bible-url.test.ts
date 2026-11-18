import { describe, expect, it } from "vitest"
import { biblePath, isReaderPath, parseBiblePath } from "./bible-url"

describe("parseBiblePath", () => {
    it("reads iso, book and chapter in any case", () => {
        expect(parseBiblePath("/eng/b/gen/2")).toEqual({ iso: "eng", book: "GEN", chapter: 2 })
        expect(parseBiblePath("/spa/b/1JN/4/")).toEqual({ iso: "spa", book: "1JN", chapter: 4 })
    })
    it("defaults to chapter 1", () => {
        expect(parseBiblePath("/eng/b/jhn")).toEqual({ iso: "eng", book: "JHN", chapter: 1 })
    })
    it("is null for other paths and bad chapters", () => {
        expect(parseBiblePath("/eng/")).toBeNull()
        expect(parseBiblePath("/eng/OBS/01/01")).toBeNull()
        expect(parseBiblePath("/eng/b/genesis/1")).toBeNull()
        expect(parseBiblePath("/eng/b/gen/0")).toBeNull()
        expect(parseBiblePath("/eng/b/gen/2/5")).toBeNull()
    })
})

describe("biblePath", () => {
    it("writes the book in lower case", () => {
        expect(biblePath("eng", { book: "GEN", chapter: 2 })).toBe("/eng/b/gen/2")
    })
})

describe("isReaderPath", () => {
    it("matches the language home and its chapter addresses", () => {
        expect(isReaderPath("/eng/")).toBe(true)
        expect(isReaderPath("/eng")).toBe(true)
        expect(isReaderPath("/eng/b/gen/2")).toBe(true)
        expect(isReaderPath("/eng/b/gen/2", "spa")).toBe(false)
    })
    it("does not match story, browse or other pages", () => {
        expect(isReaderPath("/eng/OBS/01")).toBe(false)
        expect(isReaderPath("/eng/browse/x")).toBe(false)
        expect(isReaderPath("/l/")).toBe(false)
    })
})
