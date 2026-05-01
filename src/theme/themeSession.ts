import { getNextThemeName, type ThemeName } from "./themes.ts"

const DEFAULT_THEME_NAME: ThemeName = "tokyo-night"

export interface ThemeSessionState {
  committedThemeName: ThemeName
  previewThemeName: ThemeName | null
}

export function createThemeSessionState(themeName: ThemeName = DEFAULT_THEME_NAME): ThemeSessionState {
  return {
    committedThemeName: themeName,
    previewThemeName: null,
  }
}

export function getActiveThemeName(state: ThemeSessionState): ThemeName {
  return state.previewThemeName ?? state.committedThemeName
}

export function hydrateThemeSession(state: ThemeSessionState, storedThemeName: ThemeName | null): ThemeSessionState {
  if (!storedThemeName) return state

  return {
    committedThemeName: storedThemeName,
    previewThemeName: null,
  }
}

export function previewThemeSession(state: ThemeSessionState, themeName: ThemeName): ThemeSessionState {
  if (state.previewThemeName === themeName) return state

  return {
    ...state,
    previewThemeName: themeName,
  }
}

export function commitThemeSession(_state: ThemeSessionState, themeName: ThemeName): ThemeSessionState {
  return {
    committedThemeName: themeName,
    previewThemeName: null,
  }
}

export function cancelThemePreview(state: ThemeSessionState): ThemeSessionState {
  if (state.previewThemeName === null) return state

  return {
    ...state,
    previewThemeName: null,
  }
}

export function cycleThemeSession(state: ThemeSessionState): ThemeSessionState {
  return commitThemeSession(state, getNextThemeName(state.committedThemeName))
}
