import { useCallback, useEffect, useMemo, useState } from "react"
import { useKeyboard } from "@opentui/react"
import { getTextInput, isSubmitKey, normalizeTextInput } from "../../utils/keyInput.ts"
import { subscribePaste } from "../../state/paste.ts"
import { CenteredModal, createPasteHandler } from "./CenteredModal.tsx"
import { useTheme } from "../../theme/ThemeContext.tsx"

export interface QueryDatabaseOption {
  key: string
  connectionId: string
  connectionName: string
  database: string
}

interface QueryDatabasePickerProps {
  visible: boolean
  width: number
  height: number
  options: QueryDatabaseOption[]
  onSelect: (option: QueryDatabaseOption) => void
  onClose: () => void
}

export function QueryDatabasePicker({ visible, width, height, options, onSelect, onClose }: QueryDatabasePickerProps) {
  const { colors } = useTheme()
  const [query, setQuery] = useState("")
  const [selected, setSelected] = useState(0)
  const [searchMode, setSearchMode] = useState(false)

  const filtered = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase()
    if (!normalizedQuery) return options

    return options.filter((option) => {
      const haystack = `${option.connectionName} ${option.database}`.toLowerCase()
      return haystack.includes(normalizedQuery)
    })
  }, [options, query])

  useKeyboard((key) => {
    if (!visible) return

    if (key.name === "escape") {
      if (searchMode) {
        setSearchMode(false)
        return
      }
      onClose()
      return
    }

    if (key.name === "/") {
      setSearchMode((prev) => !prev)
      return
    }

    if (!searchMode && (key.name === "down" || key.name === "j")) {
      if (filtered.length === 0) return
      setSelected((prev) => Math.min(filtered.length - 1, prev + 1))
      return
    }

    if (!searchMode && (key.name === "up" || key.name === "k")) {
      setSelected((prev) => Math.max(0, prev - 1))
      return
    }

    if (isSubmitKey(key)) {
      const selectedIndex = Math.min(selected, Math.max(0, filtered.length - 1))
      const option = filtered[selectedIndex]
      if (option) {
        onSelect(option)
      }
      return
    }

    if (!searchMode) {
      return
    }

    if (key.name === "backspace") {
      setQuery((prev) => prev.slice(0, -1))
      setSelected(0)
      return
    }

    const inputText = getTextInput(key)
    if (inputText) {
      setQuery((prev) => prev + inputText)
      setSelected(0)
    }
  })

  const applyPastedText = useCallback(
    (rawText: string) => {
      if (!visible || !searchMode) return

      const pasted = normalizeTextInput(rawText)
      if (!pasted) return

      setQuery((prev) => prev + pasted)
      setSelected(0)
    },
    [visible, searchMode]
  )

  useEffect(() => subscribePaste(applyPastedText), [applyPastedText])

  const handlePaste = createPasteHandler(applyPastedText)

  if (!visible) return null

  const panelHeight = Math.min(18, Math.max(10, height - 8))

  return (
    <CenteredModal
      width={width}
      height={height}
      minWidth={48}
      maxWidth={76}
      minHeight={10}
      maxHeight={18}
      widthPadding={10}
      heightPadding={8}
      title="Pick a database to query"
      onPaste={handlePaste}
    >
      <box height={1} paddingX={1}>
        {searchMode ? query ? <text fg={colors.textBright}>Search: {query}</text> : <text fg={colors.textBright}>Search: </text> : <text fg={colors.muted}>Press / to search databases</text>}
      </box>
      <box height={1} paddingX={1}>
        <text fg={colors.border}>{"─".repeat(200)}</text>
      </box>
      <box flexGrow={1} flexDirection="column" paddingX={1}>
        {filtered.length === 0 ? (
          <text fg={colors.muted}>No databases found</text>
        ) : (
          filtered.slice(0, panelHeight - 4).map((option, idx) => {
            const active = idx === selected
            return (
              <box key={option.key} flexDirection="row" justifyContent="space-between" backgroundColor={active ? colors.surfaceAlt : undefined}>
                <text fg={active ? colors.textBright : colors.text}>{option.database}</text>
                <text fg={colors.muted}>[{option.connectionName}]</text>
              </box>
            )
          })
        )}
      </box>
      <box height={1} paddingX={1}>
        <text fg={colors.border}>[Enter] Open query tab  [/] Search  [Esc] {searchMode ? "Exit search" : "Close"}</text>
      </box>
    </CenteredModal>
  )
}
