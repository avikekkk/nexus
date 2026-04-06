import { nodeId, type TreeNode } from "../../state/tree.ts"
import type { ConnectionState, RedisKeyType } from "../../db/types.ts"
import { getRedisTypeIcon } from "../../utils/redisIcons.ts"

const EXPANDED_ICON = "▾"
const COLLAPSED_ICON = "▸"
const LOADING_ICON = "◌"
const MAX_VISIBLE_ITEMS = 20

function formatCount(count?: number): string {
  if (count == null) return ""
  if (count >= 1000) return ` ${(count / 1000).toFixed(1)}k`
  return ` ${count}`
}

export function formatMoreLabel(totalCount?: number, visibleCount?: number): string {
  if (totalCount == null || visibleCount == null) return "more"
  return `+${Math.max(0, totalCount - visibleCount)} more`
}

export interface FlatNode {
  id: string
  label: string
  type: TreeNode["type"] | "more"
  depth: number
  isExpanded: boolean
  isLoading: boolean
  hasChildren: boolean
  connectionId: string
  database?: string
  collection?: string
  count?: number
  parentId?: string // for "more" nodes: the nodeId of the parent database
  totalCount?: number // for "more" nodes
  visibleCount?: number // for "more" nodes
  redisType?: RedisKeyType // for Redis keys
}

interface TreeStateSlice {
  treeExpanded: Set<string>
  treeLoading: Set<string>
  treeChildren: Map<string, TreeNode[]>
  treeVisibleCount: Map<string, number>
  treeNextCursor: Map<string, string | null>
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
        // Paginate collections/keys/tables
        const visibleCount = treeState.treeVisibleCount.get(dbNodeId) ?? MAX_VISIBLE_ITEMS
        const visibleChildren = children.slice(0, visibleCount)
        const nextCursor = treeState.treeNextCursor.get(dbNodeId) ?? null
        const hasMore = children.length > visibleCount || nextCursor !== null

        for (const col of visibleChildren) {
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
            redisType: col.redisType,
          })
        }

        if (children.length === 0 && !hasMore) {
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

        if (hasMore && connection.config.type !== "redis") {
          flat.push({
            id: `${dbNodeId}/__more`,
            label: `+${children.length - visibleCount} more`,
            type: "more",
            depth: 2,
            isExpanded: false,
            isLoading: false,
            hasChildren: false,
            connectionId: connId,
            database: db.database,
            parentId: dbNodeId,
            totalCount: children.length > visibleCount ? children.length : undefined,
            visibleCount,
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

  // Render "more" row differently
  if (node.type === "more") {
    return (
      <box flexDirection="row" paddingX={1} backgroundColor={bg}>
        <text fg={fg}>
          {indent}
          <span fg="#7aa2f7">… {formatMoreLabel(node.totalCount, node.visibleCount)}</span>
          <span fg="#565f89"> [m] load</span>
        </text>
      </box>
    )
  }

  let icon: string
  if (node.isLoading) {
    icon = LOADING_ICON
  } else if (node.type === "database") {
    icon = node.isExpanded ? EXPANDED_ICON : COLLAPSED_ICON
  } else {
    icon = "◦"
  }

  // Use Redis-specific icons for Redis keys (all 1-wide chars for alignment)
  // Non-redis collections use 📄 (2-wide emoji) — they won't mix with redis in the same connection
  const typeIcon = node.type === "database" ? "📁" : node.redisType !== undefined ? getRedisTypeIcon(node.redisType) : "📄"
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
