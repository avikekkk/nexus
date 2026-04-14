import { useMemo, useState } from "react"
import { useKeyboard } from "@opentui/react"
import { fuzzyScore } from "../../utils/fuzzy.ts"
import { deleteWordBackward, getPrintableKey, isDeleteWordKey, isSubmitKey } from "../../utils/keyInput.ts"

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
  const [query, setQuery] = useState("")
  const [cursorPos, setCursorPos] = useState(0)
  const [selected, setSelected] = useState(0)

  const filtered = useMemo(() => {
    const ranked = commands
      .map((cmd) => ({ cmd, score: fuzzyScore(query, `${cmd.title} ${cmd.shortcut ?? ""}`) }))
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score)
    return ranked.map((r) => r.cmd)
  }, [commands, query])

  useKeyboard((key) => {
    if (!visible) return
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

    const printable = getPrintableKey(key)
    if (printable) {
      setQuery((prev) => prev.slice(0, cursorPos) + printable + prev.slice(cursorPos))
      setCursorPos((prev) => prev + printable.length)
      setSelected(0)
      return
    }
  })

  if (!visible) return null

  const panelWidth = Math.min(72, Math.max(42, width - 8))
  const panelHeight = Math.min(16, Math.max(8, height - 8))
  const left = Math.max(0, Math.floor((width - panelWidth) / 2))
  const top = Math.max(0, Math.floor((height - panelHeight) / 2))

  return (
    <>
      <box position="absolute" left={0} top={0} width="100%" height="100%" backgroundColor="#000000" opacity={0.6} zIndex={80} />
      <box
        position="absolute"
        left={left}
        top={top}
        width={panelWidth}
        height={panelHeight}
        border
        borderStyle="rounded"
        borderColor="#7aa2f7"
        backgroundColor="#1a1b26"
        title=" Command Palette "
        zIndex={90}
        flexDirection="column"
      >
        <box height={1} paddingX={1}>
          {query ? (
            <text fg="#c0caf5">
              {query.slice(0, cursorPos)}
              {cursorPos < query.length ? (
                <span fg="#1a1b26" bg="#7aa2f7">
                  {query[cursorPos]}
                </span>
              ) : (
                <span fg="#7aa2f7">█</span>
              )}
              {query.slice(cursorPos + (cursorPos < query.length ? 1 : 0))}
            </text>
          ) : (
            <text fg="#565f89">
              <span fg="#1a1b26" bg="#7aa2f7">S</span>
              earch Commands
            </text>
          )}
        </box>
        <box height={1} paddingX={1}>
          <text fg="#414868">{"─".repeat(200)}</text>
        </box>
        <box flexGrow={1} flexDirection="column" paddingX={1}>
          {filtered.length === 0 ? (
            <text fg="#565f89">No commands</text>
          ) : (
            filtered.slice(0, panelHeight - 4).map((cmd, idx) => {
              const active = idx === selected
              return (
                <box key={cmd.id} flexDirection="row" justifyContent="space-between" backgroundColor={active ? "#283457" : undefined}>
                  <text fg={active ? "#c0caf5" : "#a9b1d6"}>{cmd.title}</text>
                  <text fg="#565f89">{cmd.shortcut ?? ""}</text>
                </box>
              )
            })
          )}
        </box>
        <box height={1} paddingX={1}>
          <text fg="#414868">[Enter] Run  [Esc] Close</text>
        </box>
      </box>
    </>
  )
}
