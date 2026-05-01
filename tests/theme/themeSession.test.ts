import { describe, expect, test } from "bun:test"

import {
  cancelThemePreview,
  commitThemeSession,
  createThemeSessionState,
  cycleThemeSession,
  getActiveThemeName,
  hydrateThemeSession,
  previewThemeSession,
} from "../../src/theme/themeSession.ts"

describe("theme session", () => {
  test("uses committed theme until a preview is active", () => {
    const initial = createThemeSessionState("tokyo-night")
    const preview = previewThemeSession(initial, "catppuccin-mocha")

    expect(getActiveThemeName(initial)).toBe("tokyo-night")
    expect(getActiveThemeName(preview)).toBe("catppuccin-mocha")
    expect(preview.committedThemeName).toBe("tokyo-night")
  })

  test("canceling preview restores the committed theme", () => {
    const preview = previewThemeSession(createThemeSessionState("tokyo-night"), "catppuccin-latte")
    const canceled = cancelThemePreview(preview)

    expect(getActiveThemeName(canceled)).toBe("tokyo-night")
    expect(canceled.previewThemeName).toBeNull()
  })

  test("committing preview clears the temporary theme", () => {
    const preview = previewThemeSession(createThemeSessionState("tokyo-night"), "catppuccin-frappe")
    const committed = commitThemeSession(preview, "catppuccin-frappe")

    expect(committed.committedThemeName).toBe("catppuccin-frappe")
    expect(committed.previewThemeName).toBeNull()
    expect(getActiveThemeName(committed)).toBe("catppuccin-frappe")
  })

  test("hydration replaces committed theme without keeping preview", () => {
    const preview = previewThemeSession(createThemeSessionState("tokyo-night"), "catppuccin-mocha")
    const hydrated = hydrateThemeSession(preview, "catppuccin-macchiato")

    expect(hydrated.committedThemeName).toBe("catppuccin-macchiato")
    expect(hydrated.previewThemeName).toBeNull()
  })

  test("cycling commits the next theme", () => {
    const cycled = cycleThemeSession(createThemeSessionState("tokyo-night"))

    expect(cycled.committedThemeName).toBe("catppuccin-latte")
    expect(cycled.previewThemeName).toBeNull()
  })
})
