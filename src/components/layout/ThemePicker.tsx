import { useEffect, useRef, useState } from "react"
import { useKeyboard } from "@opentui/react"
import { CenteredModal } from "./CenteredModal.tsx"
import { useTheme } from "../../theme/ThemeContext.tsx"
import { THEME_ORDER, THEMES, type ThemeName } from "../../theme/themes.ts"

interface ThemePickerProps {
  visible: boolean
  width: number
  height: number
  currentTheme: ThemeName
  onPreview: (themeName: ThemeName) => void
  onSelect: (themeName: ThemeName) => void
  onCancel: () => void
}

export function ThemePicker({ visible, width, height, currentTheme, onPreview, onSelect, onCancel }: ThemePickerProps) {
  const { colors } = useTheme()
  const [selected, setSelected] = useState(0)
  const openedAtRef = useRef(0)

  useEffect(() => {
    if (!visible) return
    openedAtRef.current = Date.now()
  }, [visible])

  useEffect(() => {
    if (!visible) return
    const currentIndex = Math.max(0, THEME_ORDER.indexOf(currentTheme))
    setSelected(currentIndex)
  }, [visible])

  useEffect(() => {
    if (!visible) return
    const themeName = THEME_ORDER[selected] ?? currentTheme
    if (themeName !== currentTheme) {
      onPreview(themeName)
    }
  }, [visible, selected, currentTheme, onPreview])

  useKeyboard((key) => {
    if (!visible) return
    if (Date.now() - openedAtRef.current < 120) return

    const isRepeat = key.eventType === "repeat" || key.repeated
    if (isRepeat) return

    if (key.name === "escape") {
      onCancel()
      return
    }

    if (key.name === "up" || key.name === "k") {
      setSelected((prev) => Math.max(0, prev - 1))
      return
    }

    if (key.name === "down" || key.name === "j") {
      setSelected((prev) => Math.min(THEME_ORDER.length - 1, prev + 1))
      return
    }

    if (key.name === "return" || key.name === "enter") {
      const themeName = THEME_ORDER[selected] ?? currentTheme
      onSelect(themeName)
      return
    }
  })

  if (!visible) return null

  const selectedTheme = THEME_ORDER[selected] ?? currentTheme
  const selectedLabel = THEMES[selectedTheme].label

  return (
    <CenteredModal
      width={width}
      height={height}
      minWidth={40}
      maxWidth={54}
      minHeight={10}
      maxHeight={14}
      widthPadding={10}
      heightPadding={8}
      title="Theme"
      onPaste={() => {}}
    >
      <box height={1} paddingX={1}>
        <text fg={colors.muted}>Previewing: {selectedLabel}</text>
      </box>
      <box height={1} paddingX={1}>
        <text fg={colors.border}>{"─".repeat(200)}</text>
      </box>
      <box flexGrow={1} flexDirection="column" paddingX={1}>
        {THEME_ORDER.map((themeName, index) => {
          const active = index === selected
          return (
            <box key={themeName} flexDirection="row" backgroundColor={active ? colors.surfaceAlt : undefined}>
              <text fg={active ? colors.textBright : colors.text}>{THEMES[themeName].label}</text>
            </box>
          )
        })}
      </box>
      <box height={1} paddingX={1}>
        <text fg={colors.border}>[↑/↓] Preview  [Enter] Apply  [Esc] Cancel</text>
      </box>
    </CenteredModal>
  )
}
