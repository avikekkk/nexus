import { fuzzyScore } from "../../../utils/fuzzy.ts"
import type { CompletionContext, CompletionProvider, CompletionSuggestion } from "../types.ts"

const SQL_KEYWORDS: CompletionSuggestion[] = [
  "SELECT",
  "FROM",
  "WHERE",
  "ORDER BY",
  "GROUP BY",
  "LIMIT",
  "JOIN",
  "LEFT JOIN",
  "RIGHT JOIN",
  "INNER JOIN",
  "COUNT(*)",
  "DISTINCT",
].map((keyword) => ({
  id: `mysql-keyword-${keyword}`,
  label: keyword,
  kind: "operation" as const,
  insertText: keyword,
}))

const SQL_SNIPPETS: CompletionSuggestion[] = [
  {
    id: "mysql-snippet-select",
    label: "SELECT * FROM",
    kind: "snippet",
    insertText: "SELECT * FROM ",
  },
  {
    id: "mysql-snippet-select-where",
    label: "SELECT * FROM ... WHERE ...",
    kind: "snippet",
    insertText: "SELECT * FROM  WHERE ",
    cursorOffset: "SELECT * FROM ".length,
  },
  {
    id: "mysql-snippet-count",
    label: "SELECT COUNT(*) FROM",
    kind: "snippet",
    insertText: "SELECT COUNT(*) FROM ",
  },
]

function getTokenBounds(query: string, cursor: number): { start: number; end: number; token: string } {
  let start = cursor
  while (start > 0 && /[A-Za-z0-9_]/.test(query[start - 1] ?? "")) {
    start -= 1
  }

  let end = cursor
  while (end < query.length && /[A-Za-z0-9_]/.test(query[end] ?? "")) {
    end += 1
  }

  return {
    start,
    end,
    token: query.slice(start, end),
  }
}

function rankSuggestions(items: CompletionSuggestion[], query: string): CompletionSuggestion[] {
  const scored = items
    .map((item) => ({ item, score: fuzzyScore(query, item.label) }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score)

  return scored.map((entry) => entry.item)
}

export const mysqlCompletionProvider: CompletionProvider = {
  getCompletions(context: CompletionContext) {
    const bounds = getTokenBounds(context.query, context.cursor)
    const beforeCursor = context.query.slice(0, context.cursor).toLowerCase()
    const expectTableName = /(from|join|into|update|table)\s+[a-z0-9_]*$/i.test(beforeCursor)

    const tableSuggestions: CompletionSuggestion[] = context.schema.collections.map((name) => ({
      id: `mysql-table-${name}`,
      label: name,
      kind: "collection",
      insertText: name,
      detail: `Table in ${context.database}`,
    }))

    const snippetSuggestions = context.query.trim() === "" ? SQL_SNIPPETS : []

    const base = expectTableName
      ? [...tableSuggestions, ...SQL_KEYWORDS]
      : [...SQL_KEYWORDS, ...tableSuggestions, ...snippetSuggestions]

    const items = rankSuggestions(base, bounds.token)
    if (items.length === 0) return null

    return {
      items,
      replaceStart: bounds.start,
      replaceEnd: bounds.end,
    }
  },
}
