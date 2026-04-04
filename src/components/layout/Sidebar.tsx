import { useState, useEffect, useMemo, useRef } from "react"
import { useKeyboard } from "@opentui/react"
import type { ScrollBoxRenderable } from "@opentui/core"
import { useApp } from "../../state/AppContext.tsx"
import { flattenTreeNodes, formatMoreLabel, TreeRow, type FlatNode } from "../sidebar/TreeBrowser.tsx"
import { nodeId } from "../../state/tree.ts"
import type { ConnectionStatus } from "../../db/types.ts"

interface SidebarProps {
  width: number
  height: number
  focused: boolean
  showConnectionForm: boolean
  showDatabasePicker: boolean
  showSearchDialog: boolean
  searchDialogDb: { connectionId: string; connectionName: string; database: string } | null
  onShowConnectionForm: () => void
  onShowDatabasePicker: (connectionId: string) => void
  onShowSearchDialog: (connectionId: string, connectionName: string, database: string) => void
  onFocusMain?: () => void
}

const STATUS_ICONS: Record<ConnectionStatus, string> = {
  disconnected: "○",
  connecting: "◔",
  connected: "●",
  error: "✖",
}

const STATUS_COLORS: Record<ConnectionStatus, string> = {
  disconnected: "#565f89",
  connecting: "#e0af68",
  connected: "#9ece6a",
  error: "#f7768e",
}

function truncateName(name: string, maxLen: number): string {
  if (name.length <= maxLen) return name
  if (maxLen <= 1) return "…"
  return name.slice(0, maxLen - 1) + "…"
}

type RowItem =
  | { kind: "connection"; index: number; connectionId: string }
  | { kind: "tree"; node: FlatNode }
  | { kind: "more"; connectionId: string; totalCount?: number; visibleCount: number; parentType: "connection" | "database"; parentId: string }

// Max rows to render in sidebar list (conservative estimate for typical terminal)
const MAX_RENDER_ROWS = 30

export function Sidebar({
  width,
  height,
  focused,
  showConnectionForm,
  showDatabasePicker,
  showSearchDialog,
  searchDialogDb,
  onShowConnectionForm,
  onShowDatabasePicker,
  onShowSearchDialog,
  onFocusMain,
}: SidebarProps) {
  const { state, connectTo, disconnectFrom, removeConnection, toggleExpand, openCollection, loadMoreChildren } = useApp()
  const [selectedIndex, setSelectedIndex] = useState(0)
  const scrollRef = useRef<ScrollBoxRenderable | null>(null)
  const borderColor = focused ? "#7aa2f7" : "#414868"

  const treeState = {
    treeExpanded: state.treeExpanded,
    treeLoading: state.treeLoading,
    treeChildren: state.treeChildren,
    treeVisibleCount: state.treeVisibleCount,
    treeNextCursor: state.treeNextCursor,
  }

  // Build flat list of all visible rows
  const rows = useMemo<RowItem[]>(() => {
    const items: RowItem[] = []
    state.connections.forEach((conn, i) => {
      items.push({ kind: "connection", index: i, connectionId: conn.config.id })
      if (conn.status === "connected") {
        const treeNodes = flattenTreeNodes(conn, treeState)
        for (const node of treeNodes) {
          if (node.type === "more") {
            items.push({
              kind: "more",
              connectionId: node.connectionId,
              totalCount: node.totalCount,
              visibleCount: node.visibleCount!,
              parentType: "database",
              parentId: node.parentId!,
            })
          } else {
            items.push({ kind: "tree", node })
          }
        }
        const allDbs = state.allDatabases.get(conn.config.id)
        const visibleDbs = state.visibleDatabases.get(conn.config.id)
        const isUserSelected = state.userSelectedDatabases.has(conn.config.id)
        if (allDbs && visibleDbs && allDbs.length > visibleDbs.length && !isUserSelected) {
          const connNid = nodeId(conn.config.id)
          if (state.treeExpanded.has(connNid)) {
            items.push({
              kind: "more",
              connectionId: conn.config.id,
              totalCount: allDbs.length,
              visibleCount: visibleDbs.length,
              parentType: "connection",
              parentId: connNid,
            })
          }
        }
      }
    })
    return items
  }, [
    state.connections,
    state.treeExpanded,
    state.treeLoading,
    state.treeChildren,
    state.treeVisibleCount,
    state.treeNextCursor,
    state.allDatabases,
    state.visibleDatabases,
    state.userSelectedDatabases,
  ])

  // Auto-expand connection tree when first connected
  useEffect(() => {
    for (const conn of state.connections) {
      if (conn.status === "connected") {
        const connNid = nodeId(conn.config.id)
        if (!state.treeExpanded.has(connNid) && !state.treeChildren.has(connNid)) {
          toggleExpand(connNid, conn.config.id)
        }
      }
    }
  }, [state.connections])

  const footerRows = state.connections.length > 0 ? 2 : 1
  const listViewportHeight = Math.max(1, height - 2 - footerRows)

  // Clamp selected index
  useEffect(() => {
    if (rows.length === 0 && selectedIndex !== 0) {
      setSelectedIndex(0)
      return
    }

    if (rows.length > 0 && selectedIndex >= rows.length) {
      setSelectedIndex(rows.length - 1)
    }
  }, [rows.length, selectedIndex])

  // Keep the selected row visible inside the scrollbox viewport
  useEffect(() => {
    const scrollbox = scrollRef.current
    if (!scrollbox || rows.length === 0) return

    const scrollTop = scrollbox.scrollTop
    const viewportHeight = scrollbox.viewport.height
    
    // Scroll to keep selected item visible
    if (selectedIndex < scrollTop) {
      // Selected item is above viewport - scroll up to show it at top
      scrollbox.scrollTo({ x: 0, y: selectedIndex })
    } else if (selectedIndex >= scrollTop + viewportHeight) {
      // Selected item is below viewport - scroll down to show it at bottom
      scrollbox.scrollTo({ x: 0, y: selectedIndex - viewportHeight + 1 })
    }
  }, [selectedIndex, rows.length, listViewportHeight])

  useKeyboard((key) => {
    if (!focused) return
    if (showConnectionForm || showDatabasePicker || showSearchDialog) return

    if (key.name === "a") {
      onShowConnectionForm()
      return
    }

    if (rows.length === 0) return

    if (key.name === "j" || key.name === "down") {
      setSelectedIndex((i) => Math.min(rows.length - 1, i + 1))
      return
    }
    if (key.name === "k" || key.name === "up") {
      setSelectedIndex((i) => Math.max(0, i - 1))
      return
    }

    if (key.name === "pagedown") {
      setSelectedIndex((i) => Math.min(rows.length - 1, i + listViewportHeight))
      return
    }
    if (key.name === "pageup") {
      setSelectedIndex((i) => Math.max(0, i - listViewportHeight))
      return
    }

    if (key.name === "home" || (key.name === "g" && !key.ctrl)) {
      setSelectedIndex(0)
      return
    }
    if (key.name === "end" || key.name === "G") {
      setSelectedIndex(rows.length - 1)
      return
    }

    const row = rows[selectedIndex]
    if (!row) return

    if (key.name === "e") {
      let connectionId: string | null = null
      if (row.kind === "connection") {
        const conn = state.connections[row.index]
        if (conn && conn.status === "connected") connectionId = conn.config.id
      } else if (row.kind === "tree") {
        connectionId = row.node.connectionId
      } else if (row.kind === "more") {
        connectionId = row.connectionId
      }
      if (connectionId && state.allDatabases.has(connectionId)) {
        onShowDatabasePicker(connectionId)
      }
      return
    }

    if (key.name === "s") {
      if (row.kind === "tree" && row.node.database) {
        const conn = state.connections.find((c) => c.config.id === row.node.connectionId)
        if (conn) onShowSearchDialog(row.node.connectionId, conn.config.name, row.node.database)
      }
      return
    }

    if (key.name === "m" || key.name === "return") {
      if (row.kind === "more") {
        if (row.parentType === "database" && row.parentId) {
          loadMoreChildren(row.parentId)
        } else if (row.parentType === "connection") {
          onShowDatabasePicker(row.connectionId)
        }
        return
      }

      if (row.kind === "connection") {
        const conn = state.connections[row.index]
        if (!conn) return
        if (conn.status === "disconnected" || conn.status === "error") {
          connectTo(conn.config.id)
        } else if (conn.status === "connected") {
          toggleExpand(nodeId(conn.config.id), conn.config.id)
        }
      } else if (row.kind === "tree") {
        const { node } = row
        if (node.type === "database" && !node.isLoading) {
          toggleExpand(node.id, node.connectionId, node.database)
        } else if (node.type === "collection" && node.collection && node.database) {
          openCollection(node.connectionId, node.database, node.collection)
          onFocusMain?.()
        }
      }
      return
    }

    if (key.name === "d") {
      if (row.kind === "connection") {
        const conn = state.connections[row.index]
        if (conn && (conn.status === "connected" || conn.status === "connecting")) {
          disconnectFrom(conn.config.id)
        }
      }
      return
    }

    if (key.name === "x") {
      if (row.kind === "connection") {
        const conn = state.connections[row.index]
        if (conn) {
          removeConnection(conn.config.id)
          setSelectedIndex((i) => Math.max(0, i - 1))
        }
      }
      return
    }

    if (key.name === "left" || key.name === "h") {
      if (row.kind === "tree" && row.node.type === "database" && state.treeExpanded.has(row.node.id)) {
        toggleExpand(row.node.id, row.node.connectionId, row.node.database)
      }
      return
    }

    if (key.name === "right" || key.name === "l") {
      if (row.kind === "tree" && row.node.type === "database" && !state.treeExpanded.has(row.node.id) && !row.node.isLoading) {
        toggleExpand(row.node.id, row.node.connectionId, row.node.database)
      } else if (row.kind === "connection") {
        const conn = state.connections[row.index]
        if (conn && conn.status === "connected") {
          const connNid = nodeId(conn.config.id)
          if (!state.treeExpanded.has(connNid)) toggleExpand(connNid, conn.config.id)
        }
      }
      return
    }
  })

  return (
    <box
      width={width}
      height={height}
      flexDirection="column"
      border
      borderStyle="rounded"
      borderColor={borderColor}
      title=" Connections "
      titleAlignment="left"
    >
      {rows.length === 0 ? (
        <box flexGrow={1} flexDirection="column" padding={1} gap={0}>
          <text fg="#565f89">No connections yet</text>
          <text fg="#565f89">
            Press <span fg="#7aa2f7">a</span> to add one
          </text>
        </box>
      ) : (
        <scrollbox
          ref={scrollRef}
          flexGrow={1}
          scrollY
          scrollX={false}
          verticalScrollbarOptions={{
            showArrows: false,
            trackOptions: {
              backgroundColor: "#1a1b26",
              foregroundColor: "#414868",
            },
          }}
        >
          {rows.map((row, i) => {
            const isSelected = i === selectedIndex && focused
            const bg = isSelected ? "#283457" : "transparent"
            const fg = isSelected ? "#c0caf5" : "#a9b1d6"

            if (row.kind === "connection") {
              const conn = state.connections[row.index]!
              const icon = STATUS_ICONS[conn.status]
              const iconColor = STATUS_COLORS[conn.status]
              const typeLabel = ` ${conn.config.type}`
              
              // Get database count for this connection
              const allDbs = state.allDatabases.get(conn.config.id)
              const dbCount = allDbs ? allDbs.length : 0
              const dbCountLabel = dbCount > 0 ? ` (${dbCount})` : ""
              
              const maxNameLen = Math.max(3, width - 2 - 1 - 1 - typeLabel.length - dbCountLabel.length - 2)
              const displayName = truncateName(conn.config.name, maxNameLen)
              return (
                <box key={conn.config.id} flexDirection="row" gap={1} paddingX={1} backgroundColor={bg} justifyContent="space-between">
                  <box flexDirection="row" gap={1}>
                    <text fg={iconColor}>{icon}</text>
                    <text fg={fg}>
                      {displayName}
                      <span fg="#414868">{typeLabel}</span>
                    </text>
                  </box>
                  {dbCount > 0 && (
                    <text fg="#565f89">{dbCountLabel}</text>
                  )}
                </box>
              )
            }

            if (row.kind === "tree") {
              return <TreeRow key={row.node.id} node={row.node} isSelected={isSelected} maxWidth={width - 4} />
            }

            const hint = row.parentType === "connection" ? "[e] pick" : "[m] load"
            return (
              <box key={`more-${row.parentId}`} paddingX={1} backgroundColor={bg}>
                <text fg="#7aa2f7">
                  {"    "}… {formatMoreLabel(row.totalCount, row.visibleCount)} <span fg="#565f89">{hint}</span>
                </text>
              </box>
            )
          })}
        </scrollbox>
      )}

      <box paddingX={1} flexDirection="column" flexShrink={0}>
        <text fg="#414868">
          <span fg="#7aa2f7">[a]</span> Add
          {state.connections.length > 0 && (
            <>
              {"  "}
              <span fg="#7aa2f7">[e]</span> DBs
              {"  "}
              <span fg="#7aa2f7">[s]</span> Search
            </>
          )}
        </text>
        {state.connections.length > 0 && (
          <text fg="#414868">
            <span fg="#7aa2f7">[Enter]</span> Open{"  "}
            <span fg="#7aa2f7">[m]</span> More{"  "}
            <span fg="#7aa2f7">[x]</span> Del
          </text>
        )}
      </box>
    </box>
  )
}
