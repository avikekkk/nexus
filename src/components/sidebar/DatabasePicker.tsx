import { useState, useEffect, useMemo, useRef, useCallback } from "react"
import { useKeyboard } from "@opentui/react"
import { useApp } from "../../state/AppContext.tsx"
import { debug } from "../../utils/debug.ts"
import type { DbType, CollectionInfo } from "../../db/types.ts"
import { DEFAULT_PORTS } from "../../db/types.ts"
import { parseConnectionUrl } from "../../db/url.ts"
import { getRedisTypeIcon } from "../../utils/redisIcons.ts"
import { getPrintableKey, isDeleteWordKey, isSubmitKey } from "../../utils/keyInput.ts"

interface DatabasePickerProps {
  connectionId: string
  connectionName: string
  database?: string // if provided, search collections in this database
  mode?: "select" | "search" // "select" = pick databases, "search" = search/filter collections
  width?: number
  left?: number
  top?: number
  onClose: () => void
}

const SEARCH_INITIAL_LIMIT = 200
const SEARCH_DEBOUNCE_MS = 300

export function DatabasePicker({ connectionId, connectionName, database, mode = "select", width: _width, left, top, onClose }: DatabasePickerProps) {
  const { state, setVisibleDatabases, openCollection, updateConnection, getDriver, log } = useApp()

  // Tab state: 'databases' or 'edit'
  const [activeTab, setActiveTab] = useState<"databases" | "edit">("databases")

  // For "select" mode: list of all databases
  const allDbs = state.allDatabases.get(connectionId) ?? []
  const visibleDbs = state.visibleDatabases.get(connectionId) ?? []

  const [selected, setSelected] = useState<Set<string>>(() => (mode === "select" ? new Set(visibleDbs) : new Set()))
  const [cursorIndex, setCursorIndex] = useState(0)
  const [searchMode, setSearchMode] = useState(false)
  const [searchQuery, setSearchQuery] = useState("")

  // Server-side search state (for search mode)
  const [searchResults, setSearchResults] = useState<CollectionInfo[]>([])
  const [searchLoading, setSearchLoading] = useState(false)
  const [searchTotalCount, setSearchTotalCount] = useState<number | undefined>()
  const [searchNextCursor, setSearchNextCursor] = useState<string | null>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const searchIdRef = useRef(0) // to discard stale responses
  const autoLoadCursorRef = useRef<string | null>(null)

  // Edit form state
  const currentConnection = state.connections.find((c) => c.config.id === connectionId)
  const isRedis = currentConnection?.config.type === "redis"
  const existingConfig = currentConnection?.config
  const [editName, setEditName] = useState(existingConfig?.name ?? "")
  const [editDbType, setEditDbType] = useState<DbType>(existingConfig?.type ?? "mongo")
  const [editUrl, setEditUrl] = useState(existingConfig?.url ?? "")
  const [editHost, setEditHost] = useState(existingConfig?.host ?? "localhost")
  const [editPort, setEditPort] = useState(String(existingConfig?.port ?? DEFAULT_PORTS.mongo))
  const [editUsername, setEditUsername] = useState(existingConfig?.username ?? "")
  const [editPassword, setEditPassword] = useState(existingConfig?.password ?? "")
  const [editFocusIndex, setEditFocusIndex] = useState(0)
  const [editUrlError, setEditUrlError] = useState("")

  const DB_TYPES: { name: string; value: DbType }[] = [
    { name: "MongoDB", value: "mongo" },
    { name: "MySQL", value: "mysql" },
    { name: "Redis", value: "redis" },
  ]
  const EDIT_FIELD_COUNT = 8

  const isSearch = mode === "search"
  const title = isSearch ? ` Search: ${database} ` : activeTab === "databases" ? " Select Databases " : " Edit Connection "

  debug(`[DatabasePicker] render: mode=${mode}, searchMode=${searchMode}, searchQuery="${searchQuery}", isSearch=${isSearch}`)

  useEffect(() => {
    if (mode === "select") {
      setSelected(new Set(visibleDbs))
    }
  }, [visibleDbs, mode])

  // Validate edit URL
  const hasEditUrl = editUrl.trim().length > 0
  useEffect(() => {
    if (!hasEditUrl) {
      setEditUrlError("")
      return
    }
    const result = parseConnectionUrl(editUrl, editDbType)
    if (!result.valid) {
      setEditUrlError(result.error ?? "Invalid URL")
      return
    }
    setEditUrlError("")
    const p = result.parsed!
    setEditHost(p.host)
    setEditPort(String(p.port))
    setEditUsername(p.username ?? "")
    setEditPassword(p.password ?? "")
  }, [editUrl, editDbType, hasEditUrl])

  // Server-side search for search mode
  const doSearch = useCallback((query: string, cursor: string | null = null, append = false) => {
    const driver = getDriver(connectionId)
    if (!driver?.searchCollectionsPage || !database) return

    const id = ++searchIdRef.current
    setSearchLoading(true)
    debug(`[DatabasePicker] doSearch id=${id} query="${query}" cursor=${cursor} append=${append}`)

    driver.searchCollectionsPage(database, query, cursor, SEARCH_INITIAL_LIMIT)
      .then((page) => {
        if (searchIdRef.current !== id) return // stale
        debug(`[DatabasePicker] doSearch id=${id} result: ${page.items.length} items, total=${page.totalCount}, nextCursor=${page.nextCursor}`)
        setSearchResults(prev => append ? [...prev, ...page.items] : page.items)
        setSearchTotalCount(page.totalCount)
        setSearchNextCursor(page.nextCursor)
      })
      .catch((e) => {
        if (searchIdRef.current !== id) return
        const msg = e instanceof Error ? e.message : String(e)
        log("error", "query", `Search failed: ${msg}`)
      })
      .finally(() => {
        if (searchIdRef.current !== id) return
        setSearchLoading(false)
      })
  }, [connectionId, database, getDriver, log])

  // Initial load when search dialog opens
  useEffect(() => {
    if (isSearch) {
      doSearch("")
    }
  }, [isSearch]) // eslint-disable-line react-hooks/exhaustive-deps

  // Debounced server-side search on query change
  useEffect(() => {
    if (!isSearch) return
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      setCursorIndex(0)
      autoLoadCursorRef.current = null
      doSearch(searchQuery)
    }, SEARCH_DEBOUNCE_MS)
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  }, [searchQuery]) // eslint-disable-line react-hooks/exhaustive-deps

  // Build the display item list
  const allItems = useMemo(() => {
    if (isSearch) {
      return searchResults.map((r) => r.name)
    }
    return allDbs
  }, [isSearch, searchResults, allDbs])

  const filteredItems = useMemo(() => {
    if (isSearch) return allItems // already filtered server-side
    if (!searchQuery) return allItems
    const query = searchQuery.toLowerCase()
    return allItems.filter((item) => item.toLowerCase().includes(query))
  }, [isSearch, allItems, searchQuery])

  const displayItems = filteredItems

  useEffect(() => {
    if (!isSearch || !searchNextCursor || searchLoading || displayItems.length === 0) return
    const preloadThreshold = Math.max(0, displayItems.length - 3)
    if (cursorIndex < preloadThreshold) return
    if (autoLoadCursorRef.current === searchNextCursor) return

    autoLoadCursorRef.current = searchNextCursor
    doSearch(searchQuery, searchNextCursor, true)
  }, [isSearch, searchNextCursor, searchLoading, cursorIndex, displayItems.length, doSearch, searchQuery])

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
  const tabHeaderRows = !isSearch ? 2 : 0 // Tab headers when in select mode
  // Edit tab: tabs(2) + fields(8) + error row(0-1) + save button(2) + hints(3) = ~15-16 + padding
  const height = activeTab === "edit" ? 21 : 1 + 1 + searchRows + listRows + 1 + 2 + 2 + tabHeaderRows // title + info + search + list + margin + shortcuts + padding + tabs
  const listHeight = listRows

  useKeyboard((key) => {
    debug(`[DatabasePicker] key pressed: name="${key.name}", searchMode=${searchMode}, ctrl=${key.ctrl}, meta=${key.meta}, activeTab=${activeTab}`)

    // Tab key switches between Databases/Edit tabs (not in search mode)
    if (!searchMode && mode === "select" && key.name === "tab" && !key.ctrl) {
      setActiveTab((tab) => (tab === "databases" ? "edit" : "databases"))
      return
    }

    // If on edit tab, handle edit form keys
    if (activeTab === "edit") {
      if (key.name === "escape") {
        onClose()
        return
      }

      const disabledFields = hasEditUrl ? new Set([3, 4, 5, 6]) : new Set<number>()

      // Arrow keys (up/down) navigate form fields
      if (key.name === "down") {
        setEditFocusIndex((i) => {
          let next = (i + 1) % EDIT_FIELD_COUNT
          while (disabledFields.has(next)) {
            next = (next + 1) % EDIT_FIELD_COUNT
          }
          return next
        })
        return
      }

      if (key.name === "up") {
        setEditFocusIndex((i) => {
          let next = (i - 1 + EDIT_FIELD_COUNT) % EDIT_FIELD_COUNT
          while (disabledFields.has(next)) {
            next = (next - 1 + EDIT_FIELD_COUNT) % EDIT_FIELD_COUNT
          }
          return next
        })
        return
      }

      if (key.name === "return") {
        if (editFocusIndex === 7) {
          if (hasEditUrl && editUrlError) {
            return
          }
          const config = {
            name: editName || `${editDbType} connection`,
            type: editDbType,
            host: editHost,
            port: parseInt(editPort, 10) || DEFAULT_PORTS[editDbType],
            username: editUsername || undefined,
            password: editPassword || undefined,
            url: hasEditUrl ? editUrl.trim() : undefined,
          }
          updateConnection(connectionId, config)
          onClose()
          return
        }
      }

      if (editFocusIndex === 1) {
        if (key.name === "left" || key.name === "right") {
          const currentIdx = DB_TYPES.findIndex((t) => t.value === editDbType)
          const dir = key.name === "left" ? -1 : 1
          const nextIdx = (currentIdx + dir + DB_TYPES.length) % DB_TYPES.length
          const next = DB_TYPES[nextIdx]!
          setEditDbType(next.value)
          if (!hasEditUrl) {
            setEditPort(String(DEFAULT_PORTS[next.value]))
          }
        }
      }

      return
    }
    
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
      if (isSubmitKey(key)) {
        debug(`[DatabasePicker] enter in search mode - exiting search`)
        setSearchMode(false)
        return
      }

      // Delete word: ctrl+backspace or ctrl+w
      if (isDeleteWordKey(key)) {
        setSearchQuery((q) => {
          const trimmed = q.trimEnd()
          const lastSep = Math.max(trimmed.lastIndexOf(" "), trimmed.lastIndexOf(":"), trimmed.lastIndexOf("/"))
          const newQuery = lastSep >= 0 ? q.slice(0, lastSep + 1) : ""
          debug(`[DatabasePicker] delete-word: "${q}" -> "${newQuery}"`)
          return newQuery
        })
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

      // Ignore other ctrl/meta combos
      if (key.ctrl || key.meta) return

      // Handle space
      if (key.name === "space") {
        setSearchQuery((q) => q + " ")
        return
      }

      // Handle regular character input (single printable character)
      const printable = getPrintableKey(key)
      if (printable) {
        setSearchQuery((q) => {
          const newQuery = q + printable
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
    if (isSearch && isSubmitKey(key)) {
      const item = displayItems[cursorIndex]
      if (item && database) {
        debug(`[DatabasePicker] opening collection: ${database}.${item}`)
        openCollection(connectionId, database, item)
        onClose()
      }
      return
    }

    // In select mode: Space/Return toggles selection
    if (!isSearch && (key.name === "space" || isSubmitKey(key))) {
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
      // Toggle: if all selected, unselect all; otherwise select all
      if (selected.size === allItems.length) {
        setSelected(new Set())
      } else {
        setSelected(new Set(allItems))
      }
      return
    }
  })

  const scrollOffset = Math.max(0, Math.min(cursorIndex - Math.floor(listHeight / 2), displayItems.length - listHeight))
  const visibleItems = displayItems.slice(scrollOffset, scrollOffset + listHeight)

  const infoText = isSearch
    ? searchLoading
      ? `${database}: searching...`
      : searchTotalCount != null && searchTotalCount > displayItems.length
        ? `${database}: ${displayItems.length} of ${searchTotalCount}`
        : `${database}: ${displayItems.length} items`
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
      {/* Tab headers (only in select mode, not search mode) */}
      {!isSearch && (
        <box flexDirection="row" gap={2} paddingX={1} paddingTop={1}>
          <box
            backgroundColor={activeTab === "databases" ? "#7aa2f7" : "#292e42"}
            paddingX={1}
          >
            <text fg={activeTab === "databases" ? "#1a1b26" : "#a9b1d6"}> Databases </text>
          </box>
          <box
            backgroundColor={activeTab === "edit" ? "#7aa2f7" : "#292e42"}
            paddingX={1}
          >
            <text fg={activeTab === "edit" ? "#1a1b26" : "#a9b1d6"}> Edit Connection </text>
          </box>
        </box>
      )}

      {/* Databases tab content */}
      {activeTab === "databases" && (
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

        <box flexDirection="column" marginTop={searchMode ? 0 : 1} flexGrow={1} height={listHeight}>
          {visibleItems.map((item, idx) => {
            const realIndex = scrollOffset + idx
            const isSelected = !isSearch && selected.has(item)
            const isCursor = realIndex === cursorIndex
            const checkmark = isSearch ? "◦" : isSelected ? "✓" : " "
            const checkColor = isSearch ? "#565f89" : isSelected ? "#9ece6a" : "#565f89"

            // Get Redis type icon for search mode — always show for redis so alignment is consistent
            let typeIcon = ""
            if (isSearch && isRedis) {
              const result = searchResults.find(r => r.name === item)
              typeIcon = getRedisTypeIcon(result?.redisType)
            }

            // Truncate item name to fit within dialog width
            // Available width: dialogWidth(50) - border(2) - padding(2) - checkbox(3) - icon(0 or 1) - spaces
            const iconWidth = typeIcon ? 2 : 0 // icon char + space
            const maxItemWidth = (isSearch ? 50 : 44) - 2 - 2 - 3 - iconWidth - 1
            const displayName = item.length > maxItemWidth ? item.slice(0, maxItemWidth - 1) + "…" : item

            return (
              <box
                key={item}
                flexDirection="row"
                height={1}
                backgroundColor={isCursor ? "#283457" : undefined}
                width="100%"
              >
                <text fg={checkColor}>[{checkmark}]</text>
                <text fg="#c0caf5">{typeIcon ? `${typeIcon} ` : " "}{displayName}</text>
              </box>
            )
          })}
          {displayItems.length === 0 && !searchLoading && (
            <box flexDirection="row" width="100%">
              <text fg="#565f89">  No items found</text>
            </box>
          )}
          {searchLoading && displayItems.length === 0 && (
            <box flexDirection="row" width="100%">
              <text fg="#565f89">  Loading...</text>
            </box>
          )}
        </box>

        <box paddingX={0} marginTop={1} flexDirection="column" flexShrink={0}>
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
              <span fg="#565f89">[a]</span> Check/Uncheck All
            </text>
            <text fg="#414868">
              <span fg="#565f89">[Tab]</span> Edit {"  "}
              <span fg="#565f89">[/]</span> Search {"  "}
              <span fg="#565f89">[Esc]</span> Close
            </text>
          </>
        )}
        </box>
      </box>
      )}

      {/* Edit connection tab content */}
      {!isSearch && activeTab === "edit" && existingConfig && (
        <box flexDirection="column" padding={1} gap={0} flexGrow={1}>
          {/* Name */}
          <box flexDirection="row" gap={1}>
            <text width={11} fg={editFocusIndex === 0 ? "#7aa2f7" : "#565f89"}>
              Name
            </text>
            <input
              value={editName}
              onChange={setEditName}
              placeholder="My Database"
              focused={editFocusIndex === 0}
              width={30}
              backgroundColor="#16161e"
              focusedBackgroundColor="#292e42"
              textColor="#c0caf5"
            />
          </box>

          {/* Type */}
          <box flexDirection="row" gap={1}>
            <text width={11} fg={editFocusIndex === 1 ? "#7aa2f7" : "#565f89"}>
              Type
            </text>
            <box flexDirection="row" gap={1} width={30}>
              {DB_TYPES.map((t) => (
                <text
                  key={t.value}
                  fg={editDbType === t.value ? "#1a1b26" : "#a9b1d6"}
                  bg={editDbType === t.value ? "#7aa2f7" : "#292e42"}
                >
                  {" "}
                  {t.name}{" "}
                </text>
              ))}
            </box>
          </box>

          {/* URL */}
          <box flexDirection="row" gap={1}>
            <text width={11} fg={editFocusIndex === 2 ? "#7aa2f7" : "#565f89"}>
              URL
            </text>
            <input
              value={editUrl}
              onChange={setEditUrl}
              placeholder="mongodb://user:pass@host:port/db"
              focused={editFocusIndex === 2}
              width={30}
              backgroundColor="#16161e"
              focusedBackgroundColor="#292e42"
              textColor="#c0caf5"
            />
          </box>

          {/* URL error */}
          {hasEditUrl && editUrlError ? (
            <box flexDirection="row" gap={1}>
              <text width={11}>{" "}</text>
              <text fg="#f7768e" width={30}>
                {editUrlError}
              </text>
            </box>
          ) : null}

          {/* Host */}
          <box flexDirection="row" gap={1}>
            <text width={11} fg={hasEditUrl ? "#414868" : editFocusIndex === 3 ? "#7aa2f7" : "#565f89"}>
              Host
            </text>
            <input
              value={editHost}
              onChange={hasEditUrl ? () => {} : setEditHost}
              placeholder="localhost"
              focused={!hasEditUrl && editFocusIndex === 3}
              width={30}
              backgroundColor="#16161e"
              focusedBackgroundColor={hasEditUrl ? "#16161e" : "#292e42"}
              textColor={hasEditUrl ? "#414868" : "#c0caf5"}
            />
          </box>

          {/* Port */}
          <box flexDirection="row" gap={1}>
            <text width={11} fg={hasEditUrl ? "#414868" : editFocusIndex === 4 ? "#7aa2f7" : "#565f89"}>
              Port
            </text>
            <input
              value={editPort}
              onChange={hasEditUrl ? () => {} : setEditPort}
              placeholder={String(DEFAULT_PORTS[editDbType])}
              focused={!hasEditUrl && editFocusIndex === 4}
              width={30}
              backgroundColor="#16161e"
              focusedBackgroundColor={hasEditUrl ? "#16161e" : "#292e42"}
              textColor={hasEditUrl ? "#414868" : "#c0caf5"}
            />
          </box>

          {/* Username */}
          <box flexDirection="row" gap={1}>
            <text width={11} fg={hasEditUrl ? "#414868" : editFocusIndex === 5 ? "#7aa2f7" : "#565f89"}>
              Username
            </text>
            <input
              value={editUsername}
              onChange={hasEditUrl ? () => {} : setEditUsername}
              placeholder="optional"
              focused={!hasEditUrl && editFocusIndex === 5}
              width={30}
              backgroundColor="#16161e"
              focusedBackgroundColor={hasEditUrl ? "#16161e" : "#292e42"}
              textColor={hasEditUrl ? "#414868" : "#c0caf5"}
            />
          </box>

          {/* Password */}
          <box flexDirection="row" gap={1}>
            <text width={11} fg={hasEditUrl ? "#414868" : editFocusIndex === 6 ? "#7aa2f7" : "#565f89"}>
              Password
            </text>
            <input
              value={editPassword}
              onChange={hasEditUrl ? () => {} : setEditPassword}
              placeholder="optional"
              focused={!hasEditUrl && editFocusIndex === 6}
              width={30}
              backgroundColor="#16161e"
              focusedBackgroundColor={hasEditUrl ? "#16161e" : "#292e42"}
              textColor={hasEditUrl ? "#414868" : "#c0caf5"}
            />
          </box>

          {/* Save button */}
          <box flexDirection="row" gap={1} marginTop={1}>
            <text width={11}>{" "}</text>
            <box
              width={26}
              backgroundColor={editFocusIndex === 7 ? "#7aa2f7" : "#292e42"}
              justifyContent="center"
            >
              <text fg={editFocusIndex === 7 ? "#1a1b26" : "#a9b1d6"}> Save </text>
            </box>
          </box>

          {/* Hints */}
          <box paddingX={0} marginTop={1} flexDirection="column" flexShrink={0}>
            <text fg="#414868">
              <span fg="#565f89">[↑↓]</span> Navigate {"  "}
              <span fg="#565f89">[Enter]</span> Save
            </text>
            <text fg="#414868">
              <span fg="#565f89">[Tab]</span> Switch Tab {"  "}
              <span fg="#565f89">[Esc]</span> Cancel
            </text>
          </box>
        </box>
      )}
    </box>
  )
}
