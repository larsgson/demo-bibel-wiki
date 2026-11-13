import { describe, expect, it } from "vitest"
import { singingBibleUrl } from "./singing-bible"

describe("singingBibleUrl", () => {
  it("links English chapters to their chapter page", () => {
    expect(singingBibleUrl("eng", "PSA", 23)).toBe("https://thesinging.bible/bible/psalms/23")
    expect(singingBibleUrl("eng", "1JN", 4)).toBe("https://thesinging.bible/bible/1-john/4")
    expect(singingBibleUrl("eng", "SNG", 2)).toBe("https://thesinging.bible/bible/song-of-solomon/2")
  })
  it("asks for Spanish with a style, which it needs to read lang", () => {
    expect(singingBibleUrl("spa", "JHN", 3)).toBe("https://thesinging.bible/bible/john/3?lang=es&style=alabanza")
  })
  it("links Romanian only for John, through the player's hash", () => {
    expect(singingBibleUrl("ron", "JHN", 3)).toBe("https://thesinging.bible/#rom/male/adult/contemporary-pop/43-john/3")
    expect(singingBibleUrl("ron", "MAT", 1)).toBeNull()
  })
  it("is null for other languages, unknown books and bad chapters", () => {
    expect(singingBibleUrl("fra", "JHN", 3)).toBeNull()
    expect(singingBibleUrl("eng", "TOB", 1)).toBeNull()
    expect(singingBibleUrl("eng", "JHN", 0)).toBeNull()
  })
})
