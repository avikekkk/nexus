import { mkdir, readFile, writeFile } from "node:fs/promises"
import { homedir } from "node:os"
import { join } from "node:path"
import { THEME_ORDER, type ThemeName } from "../theme/themes.ts"

const CONFIG_DIR = join(homedir(), ".db-tui")
const THEME_FILE = join(CONFIG_DIR, "theme.json")

interface ThemeConfig {
  theme: ThemeName
}

function isThemeName(value: string): value is ThemeName {
  return THEME_ORDER.includes(value as ThemeName)
}

export async function loadTheme(): Promise<ThemeName | null> {
  try {
    const raw = await readFile(THEME_FILE, "utf-8")
    const parsed = JSON.parse(raw) as Partial<ThemeConfig>

    if (parsed.theme && isThemeName(parsed.theme)) {
      return parsed.theme
    }

    return null
  } catch {
    return null
  }
}

export async function saveTheme(theme: ThemeName): Promise<void> {
  await mkdir(CONFIG_DIR, { recursive: true })
  const payload: ThemeConfig = { theme }
  await writeFile(THEME_FILE, JSON.stringify(payload, null, 2), "utf-8")
}
