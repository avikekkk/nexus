import { useState, useEffect } from "react"
import { useKeyboard } from "@opentui/react"
import { useApp } from "../../state/AppContext.tsx"

interface DatabasePickerProps {
  connectionId: string
  connectionName: string
  left?: number
  top?: number
  onClose: () => void
}

export function DatabasePicker({ connectionId, connectionName, left, top, onClose }: DatabasePickerProps) {
  const { state, setVisibleDatabases } = useApp()

  const allDbs = state.allDatabases.get(connectionId) ?? []
  const visibleDbs = state.visibleDatabases.get(connectionId) ?? []

  const [selected, setSelected] = useState<Set<string>>(() => new Set(visibleDbs))
  const [cursorIndex, setCursorIndex] = useState(0)
  useEffect(() => {
    setSelected(new Set(visibleDbs))
  }, [visibleDbs])

  const height = Math.min(allDbs.length + 6, 20)
  const listHeight = height - 6

  useKeyboard((key) => {
    if (key.name === "escape") {
      setVisibleDatabases(connectionId, Array.from(selected))
      onClose()
      return
    }

    if (key.name === "s") {
      setVisibleDatabases(connectionId, Array.from(selected))
      onClose()
      return
    }

    if (key.name === "j" || key.name === "down") {
      setCursorIndex((i) => Math.min(i + 1, allDbs.length - 1))
      return
    }

    if (key.name === "k" || key.name === "up") {
      setCursorIndex((i) => Math.max(i - 1, 0))
      return
    }

    if (key.name === "space" || key.name === "return") {
      const db = allDbs[cursorIndex]
      if (db) {
        setSelected((prev) => {
          const next = new Set(prev)
          if (next.has(db)) {
            next.delete(db)
          } else {
            next.add(db)
          }
          return next
        })
      }
      return
    }

    if (key.name === "a") {
      setSelected(new Set(allDbs))
      return
    }

    if (key.name === "n") {
      setSelected(new Set())
      return
    }
  })

  const scrollOffset = Math.max(0, Math.min(cursorIndex - Math.floor(listHeight / 2), allDbs.length - listHeight))
  const visibleItems = allDbs.slice(scrollOffset, scrollOffset + listHeight)

  return (
    <box
      position="absolute"
      left={left ?? 2}
      top={top ?? 1}
      width={44}
      height={height}
      flexDirection="column"
      border
      borderStyle="rounded"
      borderColor="#7aa2f7"
      backgroundColor="#1a1b26"
      title=" Select Databases "
      titleAlignment="center"
      zIndex={100}
    >
      <box flexDirection="column" padding={1} gap={0}>
        <text fg="#a9b1d6">
          {connectionName}: {selected.size} of {allDbs.length} selected
        </text>

        <box flexDirection="column" marginTop={1}>
          {visibleItems.map((db, idx) => {
            const realIndex = scrollOffset + idx
            const isSelected = selected.has(db)
            const isCursor = realIndex === cursorIndex
            const checkmark = isSelected ? "✓" : " "
            const checkColor = isSelected ? "#9ece6a" : "#565f89"

            return (
              <box
                key={db}
                flexDirection="row"
                backgroundColor={isCursor ? "#283457" : undefined}
                width="100%"
              >
                <text fg={checkColor}>[{checkmark}]</text>
                <text fg="#c0caf5"> {db}</text>
              </box>
            )
          })}
        </box>
      </box>

      <box paddingX={1} marginTop={0}>
        <text fg="#414868">
          <span fg="#565f89">[Space]</span> Toggle{"  "}
          <span fg="#565f89">[a]</span> All{"  "}
          <span fg="#565f89">[n]</span> None{"  "}
          <span fg="#565f89">[Esc]</span> Close
        </text>
      </box>
    </box>
  )
}
