import { useState, useEffect, useMemo } from "react"
import { useKeyboard } from "@opentui/react"
import { useApp } from "../../state/AppContext.tsx"
import { debug } from "../../utils/debug.ts"

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
  const [searchMode, setSearchMode] = useState(false)
  const [searchQuery, setSearchQuery] = useState("")

  debug(`[DatabasePicker] render: searchMode=${searchMode}, searchQuery="${searchQuery}", allDbs=${allDbs.length}`)

  useEffect(() => {
    setSelected(new Set(visibleDbs))
  }, [visibleDbs])

  const filteredDbs = useMemo(() => {
    if (!searchQuery) {
      debug(`[DatabasePicker] filteredDbs: no query, returning all ${allDbs.length} dbs`)
      return allDbs
    }
    const query = searchQuery.toLowerCase()
    const filtered = allDbs.filter((db) => db.toLowerCase().includes(query))
    debug(`[DatabasePicker] filteredDbs: query="${query}", filtered ${filtered.length}/${allDbs.length} dbs`)
    return filtered
  }, [allDbs, searchQuery])

  // Always show filtered results when there's a query
  const displayDbs = filteredDbs
  debug(`[DatabasePicker] displayDbs: ${displayDbs.length} items (searchMode=${searchMode}, hasQuery=${!!searchQuery})`)

  // Reset cursor when search results change
  useEffect(() => {
    if (searchMode && cursorIndex >= displayDbs.length) {
      setCursorIndex(Math.max(0, displayDbs.length - 1))
    }
  }, [displayDbs.length, searchMode, cursorIndex])

  // Fixed height: title + info line + search (if active) + list + shortcuts (2 lines)
  const searchRows = searchMode ? 1 : 0
  const minListRows = 8
  const maxListRows = 15
  const listRows = Math.max(minListRows, Math.min(displayDbs.length, maxListRows))
  const height = 1 + 1 + searchRows + listRows + 2 + 2 // title + info + search + list + shortcuts + padding
  const listHeight = listRows

  useKeyboard((key) => {
    debug(`[DatabasePicker] key pressed: name="${key.name}", searchMode=${searchMode}, ctrl=${key.ctrl}, meta=${key.meta}`)
    
    // Handle escape - different behavior in search vs normal mode
    if (key.name === "escape") {
      if (searchMode) {
        debug(`[DatabasePicker] escape in search mode - exiting search`)
        setSearchMode(false)
        setSearchQuery("")
        setCursorIndex(0)
      } else {
        debug(`[DatabasePicker] escape in normal mode - closing picker`)
        setVisibleDatabases(connectionId, Array.from(selected))
        onClose()
      }
      return
    }

    // In search mode - handle typing manually
    if (searchMode) {
      // Exit search mode on Enter
      if (key.name === "return") {
        debug(`[DatabasePicker] enter in search mode - exiting search`)
        setSearchMode(false)
        return
      }

      // Handle backspace
      if (key.name === "backspace") {
        setSearchQuery((q) => {
          const newQuery = q.slice(0, -1)
          debug(`[DatabasePicker] backspace: "${q}" -> "${newQuery}"`)
          return newQuery
        })
        return
      }

      // Handle regular character input (single character, no modifiers)
      if (key.name && key.name.length === 1 && !key.ctrl && !key.meta) {
        setSearchQuery((q) => {
          const newQuery = q + key.name
          debug(`[DatabasePicker] typing: "${q}" -> "${newQuery}"`)
          return newQuery
        })
        return
      }

      debug(`[DatabasePicker] in search mode, unhandled key: ${key.name}`)
      return
    }

    // Enter search mode on /
    if (key.name === "/") {
      debug(`[DatabasePicker] entering search mode`)
      setSearchMode(true)
      setSearchQuery("")
      setCursorIndex(0)
      return
    }

    // Normal mode navigation and actions
    if (key.name === "j" || key.name === "down") {
      setCursorIndex((i) => Math.min(i + 1, displayDbs.length - 1))
      return
    }

    if (key.name === "k" || key.name === "up") {
      setCursorIndex((i) => Math.max(i - 1, 0))
      return
    }

    if (key.name === "space" || key.name === "return") {
      const db = displayDbs[cursorIndex]
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

  const scrollOffset = Math.max(0, Math.min(cursorIndex - Math.floor(listHeight / 2), displayDbs.length - listHeight))
  const visibleItems = displayDbs.slice(scrollOffset, scrollOffset + listHeight)

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
      <box flexDirection="column" padding={1} gap={0} flexGrow={1}>
        <box flexDirection="row" justifyContent="space-between" width="100%">
          <text fg="#a9b1d6">
            {connectionName}: {selected.size} of {allDbs.length}
          </text>
          {!searchMode && searchQuery && (
            <text>
              <span fg="#7aa2f7">⌕ </span>
              <span fg="#565f89">"</span>
              <span fg="#9ece6a">{searchQuery}</span>
              <span fg="#565f89">"</span>
            </text>
          )}
        </box>

        {searchMode && (
          <box flexDirection="row" marginTop={1} marginBottom={1} gap={1}>
            <text fg="#565f89">Search:</text>
            <input
              value={searchQuery}
              onChange={() => {}} 
              placeholder="Type to filter..."
              focused={true}
              width={30}
              backgroundColor="#16161e"
            />
          </box>
        )}

        <box flexDirection="column" marginTop={searchMode ? 0 : 1} flexGrow={1}>
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

      <box paddingX={1} marginTop={0} flexDirection="column" flexShrink={0}>
        <text fg="#414868">
          <span fg="#565f89">[Space]</span> Toggle {"  "}
          <span fg="#565f89">[a]</span> All {"  "}
          <span fg="#565f89">[n]</span> None
        </text>
        <text fg="#414868">
          <span fg="#565f89">[/]</span> Search {"  "}
          <span fg="#565f89">[Esc]</span> Close
        </text>
      </box>
    </box>
  )
}
