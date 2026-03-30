import { useState, useEffect, useMemo } from "react"
import { useKeyboard } from "@opentui/react"
import { useApp } from "../../state/AppContext.tsx"
import { flattenTreeNodes, TreeRow, type FlatNode } from "../sidebar/TreeBrowser.tsx"
import { nodeId } from "../../state/tree.ts"
import type { ConnectionStatus } from "../../db/types.ts"

interface SidebarProps {
  width: number
  focused: boolean
  showConnectionForm: boolean
  showDatabasePicker: boolean
  onShowConnectionForm: () => void
  onShowDatabasePicker: (connectionId: string) => void
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
  | { kind: "more"; connectionId: string; totalCount: number; visibleCount: number }

export function Sidebar({
  width,
  focused,
  showConnectionForm,
  showDatabasePicker,
  onShowConnectionForm,
  onShowDatabasePicker,
  onFocusMain,
}: SidebarProps) {
  const { state, connectTo, disconnectFrom, removeConnection, toggleExpand, openCollection } = useApp()
  const [selectedIndex, setSelectedIndex] = useState(0)
  const borderColor = focused ? "#7aa2f7" : "#414868"

  const treeState = {
    treeExpanded: state.treeExpanded,
    treeLoading: state.treeLoading,
    treeChildren: state.treeChildren,
  }

  // Build flat list of all visible rows: connections + their tree nodes + "more" indicators
  const rows = useMemo<RowItem[]>(() => {
    const items: RowItem[] = []
    state.connections.forEach((conn, i) => {
      items.push({ kind: "connection", index: i, connectionId: conn.config.id })
      if (conn.status === "connected") {
        const treeNodes = flattenTreeNodes(conn, treeState)
        for (const node of treeNodes) {
          items.push({ kind: "tree", node })
        }
        // Show "more databases" indicator if there are hidden databases
        // BUT only if the user hasn't explicitly selected which databases to show
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

  // Clamp selected index when rows change
  useEffect(() => {
    if (rows.length > 0 && selectedIndex >= rows.length) {
      setSelectedIndex(rows.length - 1)
    }
  }, [rows.length, selectedIndex])

  useKeyboard((key) => {
    if (!focused) return
    if (showConnectionForm || showDatabasePicker) return

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

    const row = rows[selectedIndex]
    if (!row) return

    // 'e' key — open database picker for the current connection
    if (key.name === "e") {
      let connectionId: string | null = null
      if (row.kind === "connection") {
        const conn = state.connections[row.index]
        if (conn && conn.status === "connected") {
          connectionId = conn.config.id
        }
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

    if (key.name === "return") {
      if (row.kind === "connection") {
        const conn = state.connections[row.index]
        if (!conn) return
        if (conn.status === "disconnected" || conn.status === "error") {
          connectTo(conn.config.id)
        } else if (conn.status === "connected") {
          const connNid = nodeId(conn.config.id)
          toggleExpand(connNid, conn.config.id)
        }
      } else if (row.kind === "tree") {
        const { node } = row
        if (node.type === "database" && !node.isLoading) {
          toggleExpand(node.id, node.connectionId, node.database)
        } else if (node.type === "collection" && node.collection && node.database) {
          openCollection(node.connectionId, node.database, node.collection)
          onFocusMain?.()
        }
      } else if (row.kind === "more") {
        onShowDatabasePicker(row.connectionId)
      }
      return
    }

    if (key.name === "d") {
      if (row.kind === "connection") {
        const conn = state.connections[row.index]
        if (!conn) return
        if (conn.status === "connected" || conn.status === "connecting") {
          disconnectFrom(conn.config.id)
        }
      }
      return
    }

    if (key.name === "x") {
      if (row.kind === "connection") {
        const conn = state.connections[row.index]
        if (!conn) return
        removeConnection(conn.config.id)
        setSelectedIndex((i) => Math.max(0, i - 1))
      }
      return
    }

    // Collapse: left arrow or h
    if (key.name === "left" || key.name === "h") {
      if (row.kind === "tree") {
        const { node } = row
        if (node.type === "database" && state.treeExpanded.has(node.id)) {
          toggleExpand(node.id, node.connectionId, node.database)
        }
      }
      return
    }

    // Expand: right arrow or l
    if (key.name === "right" || key.name === "l") {
      if (row.kind === "tree") {
        const { node } = row
        if (node.type === "database" && !state.treeExpanded.has(node.id) && !node.isLoading) {
          toggleExpand(node.id, node.connectionId, node.database)
        }
      } else if (row.kind === "connection") {
        const conn = state.connections[row.index]
        if (conn && conn.status === "connected") {
          const connNid = nodeId(conn.config.id)
          if (!state.treeExpanded.has(connNid)) {
            toggleExpand(connNid, conn.config.id)
          }
        }
      }
      return
    }
  })

  return (
    <box
      width={width}
      flexDirection="column"
      border
      borderStyle="rounded"
      borderColor={borderColor}
      title=" Connections "
      titleAlignment="left"
    >
      {rows.length === 0 ? (
        <box flexDirection="column" padding={1} gap={0}>
          <text fg="#565f89">No connections yet</text>
          <text fg="#565f89">
            Press <span fg="#7aa2f7">a</span> to add one
          </text>
        </box>
      ) : (
        <box flexDirection="column" flexGrow={1}>
          {rows.map((row, i) => {
            const isSelected = i === selectedIndex && focused

            if (row.kind === "connection") {
              const conn = state.connections[row.index]!
              const icon = STATUS_ICONS[conn.status]
              const iconColor = STATUS_COLORS[conn.status]
              const bg = isSelected ? "#283457" : "transparent"
              const fg = isSelected ? "#c0caf5" : "#a9b1d6"

              // Truncate name to fit: [border=1][paddingX=1] icon [gap=1] name " type" [paddingX=1][border=1]
              const typeLabel = ` ${conn.config.type}`
              const nameOverhead = 2 + 1 + 1 + typeLabel.length + 2
              const maxNameLen = Math.max(3, width - nameOverhead)
              const displayName = truncateName(conn.config.name, maxNameLen)

              return (
                <box key={conn.config.id} flexDirection="row" gap={1} paddingX={1} backgroundColor={bg}>
                  <text fg={iconColor}>{icon}</text>
                  <text fg={fg}>
                    {displayName}
                    <span fg="#414868">{typeLabel}</span>
                  </text>
                </box>
              )
            } else if (row.kind === "tree") {
              return <TreeRow key={row.node.id} node={row.node} isSelected={isSelected} maxWidth={width - 2} />
            } else {
              // "more" row
              const bg = isSelected ? "#283457" : "transparent"
              return (
                <box key={`more-${row.connectionId}`} paddingX={1} backgroundColor={bg}>
                  <text fg="#7aa2f7">
                    {"    "}… +{row.totalCount - row.visibleCount} more{" "}
                    <span fg="#565f89">[e] to pick</span>
                  </text>
                </box>
              )
            }
          })}
        </box>
      )}

      <box paddingX={1} paddingBottom={0} flexDirection="column" flexShrink={0}>
        <text fg="#414868">
          <span fg="#7aa2f7">[a]</span> Add
          {state.connections.length > 0 ? (
            <>
              {"  "}
              <span fg="#7aa2f7">[e]</span> DBs
            </>
          ) : null}
        </text>
        {state.connections.length > 0 ? (
          <text fg="#414868">
            <span fg="#7aa2f7">[Enter]</span> Open{"  "}
            <span fg="#7aa2f7">[x]</span> Del
          </text>
        ) : null}
      </box>
    </box>
  )
}
