import type { RedisKeyType } from "../db/types.ts"

type TreeNodeType = "connection" | "database" | "collection"

export interface TreeNode {
  id: string
  label: string
  type: TreeNodeType
  connectionId: string
  database?: string
  collection?: string
  count?: number
  children?: TreeNode[]
  redisType?: RedisKeyType
}

interface TreeState {
  expanded: Set<string>
  selected: string | null
  loading: Set<string>
  children: Map<string, TreeNode[]>
}

function createTreeState(): TreeState {
  return {
    expanded: new Set(),
    selected: null,
    loading: new Set(),
    children: new Map(),
  }
}

export function nodeId(connectionId: string, database?: string, collection?: string): string {
  const parts = [connectionId]
  if (database) parts.push(database)
  if (collection) parts.push(collection)
  return parts.join("/")
}
