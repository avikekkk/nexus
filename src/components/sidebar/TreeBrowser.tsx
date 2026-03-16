import { nodeId, type TreeNode } from "../../state/tree.ts"
import type { ConnectionState } from "../../db/types.ts"

const EXPANDED_ICON = "▾"
const COLLAPSED_ICON = "▸"
const LOADING_ICON = "◌"

function formatCount(count?: number): string {
  if (count == null) return ""
  if (count >= 1000) return ` ${(count / 1000).toFixed(1)}k`
  return ` ${count}`
}

export interface FlatNode {
  id: string
  label: string
  type: TreeNode["type"]
  depth: number
  isExpanded: boolean
  isLoading: boolean
  hasChildren: boolean
  connectionId: string
  database?: string
  collection?: string
  count?: number
}

interface TreeStateSlice {
  treeExpanded: Set<string>
  treeLoading: Set<string>
  treeChildren: Map<string, TreeNode[]>
}

export function flattenTreeNodes(connection: ConnectionState, treeState: TreeStateSlice): FlatNode[] {
  const connId = connection.config.id

  if (connection.status !== "connected") return []

  const flat: FlatNode[] = []
  const connNodeId = nodeId(connId)

  const databases = treeState.treeChildren.get(connNodeId) ?? []
  const isConnLoading = treeState.treeLoading.has(connNodeId)

  if (isConnLoading) {
    flat.push({
      id: `${connNodeId}/__loading`,
      label: "Loading…",
      type: "database",
      depth: 1,
      isExpanded: false,
      isLoading: true,
      hasChildren: false,
      connectionId: connId,
    })
    return flat
  }

  for (const db of databases) {
    const dbNodeId = db.id
    const isExpanded = treeState.treeExpanded.has(dbNodeId)
    const isLoading = treeState.treeLoading.has(dbNodeId)
    const children = treeState.treeChildren.get(dbNodeId) ?? []

    flat.push({
      id: dbNodeId,
      label: db.label,
      type: "database",
      depth: 1,
      isExpanded,
      isLoading,
      hasChildren: true,
      connectionId: connId,
      database: db.database,
    })

    if (isExpanded) {
      if (isLoading) {
        flat.push({
          id: `${dbNodeId}/__loading`,
          label: "Loading…",
          type: "collection",
          depth: 2,
          isExpanded: false,
          isLoading: true,
          hasChildren: false,
          connectionId: connId,
          database: db.database,
        })
      } else {
        for (const col of children) {
          flat.push({
            id: col.id,
            label: col.label,
            type: "collection",
            depth: 2,
            isExpanded: false,
            isLoading: false,
            hasChildren: false,
            connectionId: connId,
            database: db.database,
            collection: col.collection,
            count: col.count,
          })
        }
        if (children.length === 0) {
          flat.push({
            id: `${dbNodeId}/__empty`,
            label: "(empty)",
            type: "collection",
            depth: 2,
            isExpanded: false,
            isLoading: false,
            hasChildren: false,
            connectionId: connId,
            database: db.database,
          })
        }
      }
    }
  }

  return flat
}

function truncate(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text
  if (maxLen <= 1) return "…"
  return text.slice(0, maxLen - 1) + "…"
}

export function TreeRow({
  node,
  isSelected,
  maxWidth,
}: {
  node: FlatNode
  isSelected: boolean
  maxWidth?: number
}) {
  const indent = "  ".repeat(node.depth)
  const bg = isSelected ? "#283457" : "transparent"
  const fg = isSelected ? "#c0caf5" : "#a9b1d6"

  let icon: string
  if (node.isLoading) {
    icon = LOADING_ICON
  } else if (node.type === "database") {
    icon = node.isExpanded ? EXPANDED_ICON : COLLAPSED_ICON
  } else {
    icon = "◦"
  }

  const typeIcon = node.type === "database" ? "📁" : "📄"
  const countStr = formatCount(node.count)

  // Calculate available width for the label
  // Layout: [paddingX=1] indent icon " " typeIcon " " label countStr [paddingX=1]
  // paddingX=1 on each side = 2 chars, indent = 2*depth, icon = 1, spaces + typeIcon = 4
  const overhead = 2 + indent.length + 1 + 1 + 2 + 1 + countStr.length
  const availableForLabel = maxWidth ? Math.max(3, maxWidth - overhead) : node.label.length
  const label = truncate(node.label, availableForLabel)

  return (
    <box flexDirection="row" paddingX={1} backgroundColor={bg}>
      <text fg={fg}>
        {indent}
        <span fg="#565f89">{icon}</span> {typeIcon} {label}
        {countStr && <span fg="#414868">{countStr}</span>}
      </text>
    </box>
  )
}
