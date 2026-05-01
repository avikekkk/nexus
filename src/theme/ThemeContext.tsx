import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react"
import { loadTheme, saveTheme } from "../state/theme.ts"
import { getNextThemeName, THEMES, type ThemeColors, type ThemeDefinition, type ThemeName } from "./themes.ts"

interface ThemeContextValue {
  themeName: ThemeName
  theme: ThemeDefinition
  colors: ThemeColors
  setTheme: (themeName: ThemeName) => void
  cycleTheme: () => void
}

const ThemeContext = createContext<ThemeContextValue | null>(null)

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [themeName, setThemeName] = useState<ThemeName>("tokyo-night")
  const [hydrated, setHydrated] = useState(false)

  useEffect(() => {
    loadTheme()
      .then((stored) => {
        if (stored) {
          setThemeName(stored)
        }
      })
      .finally(() => {
        setHydrated(true)
      })
  }, [])

  useEffect(() => {
    if (!hydrated) return
    saveTheme(themeName).catch(() => {})
  }, [themeName, hydrated])

  const value = useMemo<ThemeContextValue>(() => {
    const theme = THEMES[themeName]
    return {
      themeName,
      theme,
      colors: theme.colors,
      setTheme: setThemeName,
      cycleTheme: () => setThemeName((current) => getNextThemeName(current)),
    }
  }, [themeName])

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider")
  return ctx
}
