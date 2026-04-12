import { useMemo, useState } from "react"
import { useKeyboard } from "@opentui/react"
import { fuzzyScore } from "../../utils/fuzzy.ts"

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
    if (key.name === "down" || key.name === "j") {
      setSelected((prev) => Math.min(filtered.length - 1, prev + 1))
      return
    }
    if (key.name === "up" || key.name === "k") {
      setSelected((prev) => Math.max(0, prev - 1))
      return
    }
    if (key.name === "return") {
      const cmd = filtered[selected]
      if (cmd) {
        cmd.run()
        onClose()
      }
      return
    }
    if (key.name === "backspace") {
      setQuery((prev) => prev.slice(0, -1))
      setSelected(0)
      return
    }
    if (key.sequence && key.sequence.length === 1 && !key.ctrl) {
      setQuery((prev) => prev + key.sequence)
      setSelected(0)
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
          <text fg="#565f89">Query: </text>
          <text fg="#c0caf5">{query || ""}</text>
          {!query && <text fg="#7aa2f7">█</text>}
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
