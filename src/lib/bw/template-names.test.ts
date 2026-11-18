import { describe, expect, it } from "vitest"
import { assertTemplateNameAllowed, loadAllTemplates } from "./template-utils"

describe("assertTemplateNameAllowed", () => {
  it("rejects names the app's addresses use, in any case", () => {
    for (const name of ["b", "B", "browse", "C", "search"]) {
      expect(() => assertTemplateNameAllowed(name)).toThrow(/reserved/)
    }
  })
  it("allows other names", () => {
    for (const name of ["OBS", "John", "test", "bible"]) {
      expect(() => assertTemplateNameAllowed(name)).not.toThrow()
    }
  })
  it("passes for the templates in this repo", () => {
    expect(Object.keys(loadAllTemplates()).length).toBeGreaterThan(0)
  })
})
