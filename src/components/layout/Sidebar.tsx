import { useState, useEffect, useMemo } from "react"
import { useKeyboard } from "@opentui/react"
import { useApp } from "../../state/AppContext.tsx"
import { ConnectionForm } from "../sidebar/ConnectionForm.tsx"
import { flattenTreeNodes, TreeRow, type FlatNode } from "../sidebar/TreeBrowser.tsx"
import { nodeId } from "../../state/tree.ts"
import type { ConnectionConfig, ConnectionStatus } from "../../db/types.ts"

interface SidebarProps {
  width: number
  focused: boolean
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

type RowItem =
  | { kind: "connection"; index: number; connectionId: string }
  | { kind: "tree"; node: FlatNode }

export function Sidebar({ width, focused }: SidebarProps) {
  const { state, connectTo, disconnectFrom, addConnection, removeConnection, toggleExpand, openCollection } = useApp()
  const [showForm, setShowForm] = useState(false)
  const [selectedIndex, setSelectedIndex] = useState(0)
  const borderColor = focused ? "#7aa2f7" : "#414868"

  const treeState = {
    treeExpanded: state.treeExpanded,
    treeLoading: state.treeLoading,
    treeChildren: state.treeChildren,
  }

  // Build flat list of all visible rows: connections + their tree nodes
  const rows = useMemo<RowItem[]>(() => {
    const items: RowItem[] = []
    state.connections.forEach((conn, i) => {
      items.push({ kind: "connection", index: i, connectionId: conn.config.id })
      if (conn.status === "connected") {
        const treeNodes = flattenTreeNodes(conn, treeState)
        for (const node of treeNodes) {
          items.push({ kind: "tree", node })
        }
      }
    })
    return items
  }, [state.connections, state.treeExpanded, state.treeLoading, state.treeChildren])

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
    if (showForm) return

    if (key.name === "a") {
      setShowForm(true)
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

    if (key.name === "enter") {
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
        }
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

  const handleFormSubmit = (config: Omit<ConnectionConfig, "id">) => {
    addConnection(config)
    setShowForm(false)
  }

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
              const bg = isSelected ? "#292e42" : "transparent"
              const fg = isSelected ? "#c0caf5" : "#a9b1d6"

              return (
                <box key={conn.config.id} flexDirection="row" gap={1} paddingX={1} backgroundColor={bg}>
                  <text fg={iconColor}>{icon}</text>
                  <text fg={fg}>
                    {conn.config.name}
                    <span fg="#414868"> {conn.config.type}</span>
                  </text>
                </box>
              )
            } else {
              return <TreeRow key={row.node.id} node={row.node} isSelected={isSelected} />
            }
          })}
        </box>
      )}

      <box paddingX={1} paddingBottom={0}>
        <text fg="#414868">
          <span fg="#7aa2f7">[a]</span> Add
          {state.connections.length > 0 ? (
            <>
              {"  "}
              <span fg="#7aa2f7">[Enter]</span> Open{"  "}
              <span fg="#7aa2f7">[x]</span> Remove
            </>
          ) : null}
        </text>
      </box>

      {showForm && <ConnectionForm onSubmit={handleFormSubmit} onCancel={() => setShowForm(false)} />}
    </box>
  )
}
