import { fuzzyScore } from "../../../utils/fuzzy.ts"
import type { CompletionContext, CompletionProvider, CompletionResult, CompletionSuggestion } from "../types.ts"

interface ParsedContext {
  mode: "collections" | "rootOperations" | "chainOperations"
  token: string
  replaceStart: number
  replaceEnd: number
}

const ROOT_OPERATIONS: CompletionSuggestion[] = [
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
]

const CHAIN_OPERATIONS: CompletionSuggestion[] = [
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

  const operationsMatch = beforeCursor.match(/(.+)\.([A-Za-z0-9_$]*)$/)
  if (!operationsMatch) return null

  const expression = operationsMatch[1] ?? ""
  const token = operationsMatch[2] ?? ""

  if (/^db\.[A-Za-z0-9_$]+$/.test(expression)) {
    return {
      mode: "rootOperations",
      token,
      replaceStart: cursor - token.length,
      replaceEnd: cursor,
    }
  }

  if (/^db\.[A-Za-z0-9_$]+\.find\(/.test(expression)) {
    return {
      mode: "chainOperations",
      token,
      replaceStart: cursor - token.length,
      replaceEnd: cursor,
    }
  }

  return null
}

function rankSuggestions(items: CompletionSuggestion[], token: string): CompletionSuggestion[] {
  const scored = items
    .map((item) => ({ item, score: fuzzyScore(token, item.label) }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score)

  return scored.map((entry) => entry.item)
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

      return {
        items: rankSuggestions([...collectionSuggestions, ...siblingDatabaseSuggestions], parsed.token),
        replaceStart: parsed.replaceStart,
        replaceEnd: parsed.replaceEnd,
      }
    }

    const items = parsed.mode === "chainOperations" ? CHAIN_OPERATIONS : ROOT_OPERATIONS
    return {
      items: rankSuggestions(items, parsed.token),
      replaceStart: parsed.replaceStart,
      replaceEnd: parsed.replaceEnd,
    }
  },
}
