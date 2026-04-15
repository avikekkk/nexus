import type { CompletionContext, CompletionProvider, CompletionResult, CompletionSuggestion } from "../types.ts"

interface ParsedContext {
  mode: "collections" | "operations"
  collection?: string
  token: string
  replaceStart: number
  replaceEnd: number
}

const COLLECTION_OPERATIONS: CompletionSuggestion[] = [
  {
    id: "mongo-op-find",
    label: "find({})",
    kind: "operation",
    insertText: "find({})",
    cursorOffset: "find({".length,
    detail: "Find documents",
  },
  {
    id: "mongo-op-findOne",
    label: "findOne({})",
    kind: "operation",
    insertText: "findOne({})",
    cursorOffset: "findOne({".length,
    detail: "Find a single document",
  },
  {
    id: "mongo-op-countDocuments",
    label: "countDocuments({})",
    kind: "operation",
    insertText: "countDocuments({})",
    cursorOffset: "countDocuments({".length,
    detail: "Count documents",
  },
  {
    id: "mongo-op-aggregate",
    label: "aggregate([])",
    kind: "operation",
    insertText: "aggregate([])",
    cursorOffset: "aggregate([".length,
    detail: "Run aggregation pipeline",
  },
  {
    id: "mongo-op-sort",
    label: "sort({})",
    kind: "operation",
    insertText: "sort({})",
    cursorOffset: "sort({".length,
    detail: "Sort result documents",
  },
  {
    id: "mongo-op-limit",
    label: "limit(20)",
    kind: "operation",
    insertText: "limit(20)",
    cursorOffset: "limit(".length,
    detail: "Limit result count",
  },
  {
    id: "mongo-op-skip",
    label: "skip(0)",
    kind: "operation",
    insertText: "skip(0)",
    cursorOffset: "skip(".length,
    detail: "Skip N documents",
  },
]

function parseMongoCompletionContext(query: string, cursor: number): ParsedContext | null {
  const beforeCursor = query.slice(0, cursor)

  const operationsMatch = beforeCursor.match(/db\.([A-Za-z0-9_$]+)\.([A-Za-z0-9_$]*)$/)
  if (operationsMatch) {
    const token = operationsMatch[2] ?? ""
    return {
      mode: "operations",
      collection: operationsMatch[1] ?? "",
      token,
      replaceStart: cursor - token.length,
      replaceEnd: cursor,
    }
  }

  const collectionsMatch = beforeCursor.match(/db\.([A-Za-z0-9_$]*)$/)
  if (collectionsMatch) {
    const token = collectionsMatch[1] ?? ""
    return {
      mode: "collections",
      token,
      replaceStart: cursor - token.length,
      replaceEnd: cursor,
    }
  }

  return null
}

function rankByPrefixMatch(items: CompletionSuggestion[], token: string): CompletionSuggestion[] {
  const normalizedToken = token.toLowerCase()
  if (!normalizedToken) return items

  return items
    .filter((item) => item.label.toLowerCase().includes(normalizedToken))
    .sort((a, b) => {
      const aStarts = a.label.toLowerCase().startsWith(normalizedToken)
      const bStarts = b.label.toLowerCase().startsWith(normalizedToken)
      if (aStarts !== bStarts) return aStarts ? -1 : 1
      return a.label.localeCompare(b.label)
    })
}

export const mongoCompletionProvider: CompletionProvider = {
  getCompletions(context: CompletionContext): CompletionResult | null {
    const parsed = parseMongoCompletionContext(context.query, context.cursor)
    if (!parsed) return null

    if (parsed.mode === "collections") {
      const collectionSuggestions: CompletionSuggestion[] = context.schema.collections.map((name) => ({
        id: `mongo-col-${name}`,
        label: name,
        kind: "collection",
        insertText: name,
        detail: `Collection in ${context.database}`,
      }))

      const siblingDatabaseSuggestions: CompletionSuggestion[] = context.schema.databases.map((name) => ({
        id: `mongo-db-${name}`,
        label: `getSiblingDb(\"${name}\")`,
        kind: "database",
        insertText: `getSiblingDb(\"${name}\")`,
        detail: `Switch to database ${name}`,
      }))

      const items = rankByPrefixMatch([...collectionSuggestions, ...siblingDatabaseSuggestions], parsed.token)
      return {
        items,
        replaceStart: parsed.replaceStart,
        replaceEnd: parsed.replaceEnd,
      }
    }

    const operations = rankByPrefixMatch(COLLECTION_OPERATIONS, parsed.token)
    return {
      items: operations,
      replaceStart: parsed.replaceStart,
      replaceEnd: parsed.replaceEnd,
    }
  },
}
