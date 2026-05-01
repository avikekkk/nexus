import { createContext, use, useCallback, useEffect, useMemo, useState, type ReactNode } from "react"
import { loadTheme, saveTheme } from "../state/theme.ts"
import { THEMES, type ThemeColors, type ThemeDefinition, type ThemeName } from "./themes.ts"
import {
  cancelThemePreview,
  commitThemeSession,
  createThemeSessionState,
  cycleThemeSession,
  getActiveThemeName,
  hydrateThemeSession,
  previewThemeSession,
} from "./themeSession.ts"

interface ThemeContextValue {
  themeName: ThemeName
  committedThemeName: ThemeName
  theme: ThemeDefinition
  colors: ThemeColors
  isPreviewing: boolean
  previewTheme: (themeName: ThemeName) => void
  commitTheme: (themeName: ThemeName) => void
  cancelPreview: () => void
  cycleTheme: () => void
}

const ThemeContext = createContext<ThemeContextValue | null>(null)

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [themeState, setThemeState] = useState(createThemeSessionState)

  useEffect(() => {
    loadTheme().then((stored) => {
      if (stored) {
        setThemeState((state) => hydrateThemeSession(state, stored))
      }
    })
  }, [])

  const previewTheme = useCallback((themeName: ThemeName) => {
    setThemeState((state) => previewThemeSession(state, themeName))
  }, [])

  const commitTheme = useCallback((themeName: ThemeName) => {
    setThemeState((state) => commitThemeSession(state, themeName))
    saveTheme(themeName).catch(() => {})
  }, [])

  const cancelPreview = useCallback(() => {
    setThemeState(cancelThemePreview)
  }, [])

  const cycleTheme = useCallback(() => {
    const nextState = cycleThemeSession(themeState)
    setThemeState(nextState)
    saveTheme(nextState.committedThemeName).catch(() => {})
  }, [themeState])

  const value = useMemo<ThemeContextValue>(() => {
    const themeName = getActiveThemeName(themeState)
    const theme = THEMES[themeName]
    return {
      themeName,
      committedThemeName: themeState.committedThemeName,
      theme,
      colors: theme.colors,
      isPreviewing: themeState.previewThemeName !== null,
      previewTheme,
      commitTheme,
      cancelPreview,
      cycleTheme,
    }
  }, [themeState, previewTheme, commitTheme, cancelPreview, cycleTheme])

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

export function useTheme(): ThemeContextValue {
  const ctx = use(ThemeContext)
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider")
  return ctx
}
