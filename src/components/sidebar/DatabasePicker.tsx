import { useState, useEffect, useMemo } from "react"
import { useKeyboard } from "@opentui/react"
import { useApp } from "../../state/AppContext.tsx"
import { debug } from "../../utils/debug.ts"
import { nodeId } from "../../state/tree.ts"

interface DatabasePickerProps {
  connectionId: string
  connectionName: string
  database?: string // if provided, search collections in this database
  mode?: "select" | "search" // "select" = pick databases, "search" = search/filter collections
  left?: number
  top?: number
  onClose: () => void
}

export function DatabasePicker({ connectionId, connectionName, database, mode = "select", left, top, onClose }: DatabasePickerProps) {
  const { state, setVisibleDatabases, openCollection } = useApp()

  // For "select" mode: list of all databases
  const allDbs = state.allDatabases.get(connectionId) ?? []
  const visibleDbs = state.visibleDatabases.get(connectionId) ?? []

  // For "search" mode: list of collections/keys/tables in a database
  const dbNodeId = database ? nodeId(connectionId, database) : null
  const dbChildren = dbNodeId ? (state.treeChildren.get(dbNodeId) ?? []) : []

  const [selected, setSelected] = useState<Set<string>>(() => (mode === "select" ? new Set(visibleDbs) : new Set()))
  const [cursorIndex, setCursorIndex] = useState(0)
  const [searchMode, setSearchMode] = useState(false)
  const [searchQuery, setSearchQuery] = useState("")

  const isSearch = mode === "search"
  const title = isSearch ? ` Search: ${database} ` : " Select Databases "

  debug(`[DatabasePicker] render: mode=${mode}, searchMode=${searchMode}, searchQuery="${searchQuery}", isSearch=${isSearch}`)

  useEffect(() => {
    if (mode === "select") {
      setSelected(new Set(visibleDbs))
    }
  }, [visibleDbs, mode])

  // Build the full item list based on mode
  const allItems = useMemo(() => {
    if (isSearch) {
      return dbChildren.map((child) => child.label)
    }
    return allDbs
  }, [isSearch, dbChildren, allDbs])

  const filteredItems = useMemo(() => {
    if (!searchQuery) {
      debug(`[DatabasePicker] filteredItems: no query, returning all ${allItems.length} items`)
      return allItems
    }
    const query = searchQuery.toLowerCase()
    const filtered = allItems.filter((item) => item.toLowerCase().includes(query))
    debug(`[DatabasePicker] filteredItems: query="${query}", filtered ${filtered.length}/${allItems.length} items`)
    return filtered
  }, [allItems, searchQuery])

  const displayItems = filteredItems
  debug(`[DatabasePicker] displayItems: ${displayItems.length} items (searchMode=${searchMode}, hasQuery=${!!searchQuery})`)

  // Reset cursor when search results change
  useEffect(() => {
    if (searchMode && cursorIndex >= displayItems.length) {
      setCursorIndex(Math.max(0, displayItems.length - 1))
    }
  }, [displayItems.length, searchMode, cursorIndex])

  // Fixed height: title + info line + search (if active) + list + shortcuts (2 lines)
  const searchRows = searchMode ? 1 : 0
  const minListRows = 8
  const maxListRows = 15
  const listRows = Math.max(minListRows, Math.min(displayItems.length, maxListRows))
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
        if (mode === "select") {
          setVisibleDatabases(connectionId, Array.from(selected))
        }
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
      setCursorIndex((i) => Math.min(i + 1, displayItems.length - 1))
      return
    }

    if (key.name === "k" || key.name === "up") {
      setCursorIndex((i) => Math.max(i - 1, 0))
      return
    }

    // Page up/down
    if (key.name === "pagedown") {
      setCursorIndex((i) => Math.min(i + listHeight, displayItems.length - 1))
      return
    }
    if (key.name === "pageup") {
      setCursorIndex((i) => Math.max(i - listHeight, 0))
      return
    }

    // In search mode: Enter opens the collection
    if (isSearch && key.name === "return") {
      const item = displayItems[cursorIndex]
      if (item && database) {
        debug(`[DatabasePicker] opening collection: ${database}.${item}`)
        openCollection(connectionId, database, item)
        onClose()
      }
      return
    }

    // In select mode: Space/Return toggles selection
    if (!isSearch && (key.name === "space" || key.name === "return")) {
      const db = displayItems[cursorIndex]
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

    if (!isSearch && key.name === "a") {
      setSelected(new Set(allItems))
      return
    }

    if (!isSearch && key.name === "n") {
      setSelected(new Set())
      return
    }
  })

  const scrollOffset = Math.max(0, Math.min(cursorIndex - Math.floor(listHeight / 2), displayItems.length - listHeight))
  const visibleItems = displayItems.slice(scrollOffset, scrollOffset + listHeight)

  const infoText = isSearch
    ? `${database}: ${displayItems.length} items`
    : `${connectionName}: ${selected.size} of ${allDbs.length}`

  return (
    <box
      position="absolute"
      left={left ?? 2}
      top={top ?? 1}
      width={isSearch ? 50 : 44}
      height={height}
      flexDirection="column"
      border
      borderStyle="rounded"
      borderColor="#7aa2f7"
      backgroundColor="#1a1b26"
      title={title}
      titleAlignment="center"
      zIndex={100}
    >
      <box flexDirection="column" padding={1} gap={0} flexGrow={1}>
        <box flexDirection="row" justifyContent="space-between" width="100%">
          <text fg="#a9b1d6">{infoText}</text>
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
          {visibleItems.map((item, idx) => {
            const realIndex = scrollOffset + idx
            const isSelected = !isSearch && selected.has(item)
            const isCursor = realIndex === cursorIndex
            const checkmark = isSearch ? "◦" : isSelected ? "✓" : " "
            const checkColor = isSearch ? "#565f89" : isSelected ? "#9ece6a" : "#565f89"

            return (
              <box
                key={item}
                flexDirection="row"
                backgroundColor={isCursor ? "#283457" : undefined}
                width="100%"
              >
                <text fg={checkColor}>[{checkmark}]</text>
                <text fg="#c0caf5"> {item}</text>
              </box>
            )
          })}
          {displayItems.length === 0 && (
            <box flexDirection="row" width="100%">
              <text fg="#565f89">  No items found</text>
            </box>
          )}
        </box>
      </box>

      <box paddingX={1} marginTop={0} flexDirection="column" flexShrink={0}>
        {isSearch ? (
          <>
            <text fg="#414868">
              <span fg="#565f89">[Enter]</span> Open {"  "}
              <span fg="#565f89">[/]</span> Search
            </text>
            <text fg="#414868">
              <span fg="#565f89">[j/k]</span> Navigate {"  "}
              <span fg="#565f89">[Esc]</span> Close
            </text>
          </>
        ) : (
          <>
            <text fg="#414868">
              <span fg="#565f89">[Space]</span> Toggle {"  "}
              <span fg="#565f89">[a]</span> All {"  "}
              <span fg="#565f89">[n]</span> None
            </text>
            <text fg="#414868">
              <span fg="#565f89">[/]</span> Search {"  "}
              <span fg="#565f89">[Esc]</span> Close
            </text>
          </>
        )}
      </box>
    </box>
  )
}
