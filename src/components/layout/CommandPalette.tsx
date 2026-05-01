import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useKeyboard } from "@opentui/react"
import { fuzzyScore } from "../../utils/fuzzy.ts"
import { deleteWordBackward, getTextInput, isDeleteWordKey, isSubmitKey, normalizeTextInput } from "../../utils/keyInput.ts"
import { subscribePaste } from "../../state/paste.ts"
import { CenteredModal, createPasteHandler } from "./CenteredModal.tsx"
import { useTheme } from "../../theme/ThemeContext.tsx"

export interface CommandItem {
  id: string
  title: string
  shortcut?: string
  run: () => void
}

interface CommandPaletteProps {
  visible: boolean
  width: number
  height: number
  commands: CommandItem[]
  onClose: () => void
}

export function CommandPalette({ visible, width, height, commands, onClose }: CommandPaletteProps) {
  const { colors } = useTheme()
  const [query, setQuery] = useState("")
  const [cursorPos, setCursorPos] = useState(0)
  const [selected, setSelected] = useState(0)
  const openedAtRef = useRef(0)

  const filtered = useMemo(() => {
    const ranked: { cmd: CommandItem; score: number }[] = []

    for (const cmd of commands) {
      const score = fuzzyScore(query, `${cmd.title} ${cmd.shortcut ?? ""}`)
      if (score > 0) ranked.push({ cmd, score })
    }

    ranked.sort((a, b) => b.score - a.score)
    return ranked.map((r) => r.cmd)
  }, [commands, query])

  useEffect(() => {
    if (!visible) return
    openedAtRef.current = Date.now()
  }, [visible])

  useKeyboard((key) => {
    if (!visible) return
    if (Date.now() - openedAtRef.current < 120) return

    const isRepeat = key.eventType === "repeat" || key.repeated
    if (isRepeat) return

    if (key.name === "escape") {
      onClose()
      return
    }
    if (key.name === "down") {
      setSelected((prev) => Math.min(filtered.length - 1, prev + 1))
      return
    }
    if (key.name === "up") {
      setSelected((prev) => Math.max(0, prev - 1))
      return
    }
    if (isSubmitKey(key)) {
      const cmd = filtered[selected]
      if (cmd) {
        cmd.run()
        onClose()
      }
      return
    }

    if (isDeleteWordKey(key)) {
      const result = deleteWordBackward(query, cursorPos)
      setQuery(result.value)
      setCursorPos(result.cursor)
      setSelected(0)
      return
    }

    if (key.name === "left") {
      setCursorPos((prev) => Math.max(0, prev - 1))
      return
    }

    if (key.name === "right") {
      setCursorPos((prev) => Math.min(query.length, prev + 1))
      return
    }

    if (key.name === "home") {
      setCursorPos(0)
      return
    }

    if (key.name === "end") {
      setCursorPos(query.length)
      return
    }

    if (key.name === "backspace") {
      if (cursorPos <= 0) return
      setQuery((prev) => prev.slice(0, cursorPos - 1) + prev.slice(cursorPos))
      setCursorPos((prev) => prev - 1)
      setSelected(0)
      return
    }

    if (key.name === "delete") {
      if (cursorPos >= query.length) return
      setQuery((prev) => prev.slice(0, cursorPos) + prev.slice(cursorPos + 1))
      setSelected(0)
      return
    }

    const inputText = getTextInput(key)
    if (inputText) {
      setQuery((prev) => prev.slice(0, cursorPos) + inputText + prev.slice(cursorPos))
      setCursorPos((prev) => prev + inputText.length)
      setSelected(0)
      return
    }
  })

  const applyPastedText = useCallback(
    (rawText: string) => {
      if (!visible) return

      const pasted = normalizeTextInput(rawText)
      if (!pasted) return

      setQuery((prev) => prev.slice(0, cursorPos) + pasted + prev.slice(cursorPos))
      setCursorPos((prev) => prev + pasted.length)
      setSelected(0)
    },
    [visible, cursorPos]
  )

  useEffect(() => subscribePaste(applyPastedText), [applyPastedText])

  const handlePaste = createPasteHandler(applyPastedText)

  if (!visible) return null

  const panelHeight = Math.min(16, Math.max(8, height - 8))

  return (
    <CenteredModal
      width={width}
      height={height}
      minWidth={42}
      maxWidth={72}
      minHeight={8}
      maxHeight={16}
      widthPadding={8}
      heightPadding={8}
      title="Command Palette"
      onPaste={handlePaste}
    >
      <box height={1} paddingX={1}>
        {query ? (
          <text fg={colors.textBright}>
            {query.slice(0, cursorPos)}
            {cursorPos < query.length ? (
              <span fg={colors.background} bg={colors.accent}>
                {query[cursorPos]}
              </span>
            ) : (
              <span fg={colors.accent}>█</span>
            )}
            {query.slice(cursorPos + (cursorPos < query.length ? 1 : 0))}
          </text>
        ) : (
          <text fg={colors.muted}>
            <span fg={colors.background} bg={colors.accent}>S</span>
            earch Commands
          </text>
        )}
      </box>
      <box height={1} paddingX={1}>
        <text fg={colors.border}>{"─".repeat(200)}</text>
      </box>
      <box flexGrow={1} flexDirection="column" paddingX={1}>
        {filtered.length === 0 ? (
          <text fg={colors.muted}>No commands</text>
        ) : (
          filtered.slice(0, panelHeight - 4).map((cmd, idx) => {
            const active = idx === selected
            return (
              <box key={cmd.id} flexDirection="row" justifyContent="space-between" backgroundColor={active ? colors.surfaceAlt : undefined}>
                <text fg={active ? colors.textBright : colors.text}>{cmd.title}</text>
                <text fg={colors.muted}>{cmd.shortcut ?? ""}</text>
              </box>
            )
          })
        )}
      </box>
      <box height={1} paddingX={1}>
        <text fg={colors.border}>[Enter] Run  [Esc] Close</text>
      </box>
    </CenteredModal>
  )
}
