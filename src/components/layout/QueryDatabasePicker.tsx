import { useCallback, useEffect, useMemo, useState } from "react"
import { useKeyboard } from "@opentui/react"
import { getTextInput, isSubmitKey, normalizeTextInput } from "../../utils/keyInput.ts"
import { subscribePaste } from "../../state/paste.ts"

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

  const handlePaste = (event: { text: string; preventDefault?: () => void; stopPropagation?: () => void }) => {
    applyPastedText(event.text)
    event.preventDefault?.()
    event.stopPropagation?.()
  }

  if (!visible) return null

  const panelWidth = Math.min(76, Math.max(48, width - 10))
  const panelHeight = Math.min(18, Math.max(10, height - 8))
  const left = Math.max(0, Math.floor((width - panelWidth) / 2))
  const top = Math.max(0, Math.floor((height - panelHeight) / 2))

  return (
    <>
      <box position="absolute" left={0} top={0} width="100%" height="100%" backgroundColor="#000000" opacity={0.6} zIndex={80} />
      <box
        position="absolute"
        left={left}
        top={top}
        onPaste={handlePaste}
        width={panelWidth}
        height={panelHeight}
        border
        borderStyle="rounded"
        borderColor="#7aa2f7"
        backgroundColor="#1a1b26"
        title=" Pick a database to query "
        zIndex={90}
        flexDirection="column"
      >
        <box height={1} paddingX={1}>
          {searchMode ? (
            query ? <text fg="#c0caf5">Search: {query}</text> : <text fg="#c0caf5">Search: </text>
          ) : (
            <text fg="#565f89">Press / to search databases</text>
          )}
        </box>
        <box height={1} paddingX={1}>
          <text fg="#414868">{"─".repeat(200)}</text>
        </box>
        <box flexGrow={1} flexDirection="column" paddingX={1}>
          {filtered.length === 0 ? (
            <text fg="#565f89">No databases found</text>
          ) : (
            filtered.slice(0, panelHeight - 4).map((option, idx) => {
              const active = idx === selected
              return (
                <box
                  key={option.key}
                  flexDirection="row"
                  justifyContent="space-between"
                  backgroundColor={active ? "#283457" : undefined}
                >
                  <text fg={active ? "#c0caf5" : "#a9b1d6"}>{option.database}</text>
                  <text fg="#565f89">[{option.connectionName}]</text>
                </box>
              )
            })
          )}
        </box>
        <box height={1} paddingX={1}>
          <text fg="#414868">[Enter] Open query tab  [/] Search  [Esc] {searchMode ? "Exit search" : "Close"}</text>
        </box>
      </box>
    </>
  )
}
