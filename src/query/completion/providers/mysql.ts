import { rankCompletionSuggestions } from "../ranking.ts"
import type { CompletionContext, CompletionProvider, CompletionSuggestion } from "../types.ts"

interface TokenBounds {
  start: number
  end: number
  token: string
}

interface SqlTableRef {
  table: string
  alias: string
}

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
  "AND",
  "OR",
  "IN",
  "LIKE",
  "IS NULL",
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

function getTokenBounds(query: string, cursor: number): TokenBounds {
  let start = cursor
  while (start > 0 && /[A-Za-z0-9_.]/.test(query[start - 1] ?? "")) {
    start -= 1
  }

  let end = cursor
  while (end < query.length && /[A-Za-z0-9_.]/.test(query[end] ?? "")) {
    end += 1
  }

  return {
    start,
    end,
    token: query.slice(start, end),
  }
}

function parseTableRefs(sql: string): SqlTableRef[] {
  const refs: SqlTableRef[] = []
  const pattern = /\b(?:from|join)\s+`?([A-Za-z0-9_]+)`?(?:\s+(?:as\s+)?([A-Za-z0-9_]+))?/gi
  const reserved = new Set(["where", "group", "order", "limit", "join", "left", "right", "inner", "on"])

  let match = pattern.exec(sql)
  while (match) {
    const table = match[1] ?? ""
    if (table) {
      const candidateAlias = match[2]?.toLowerCase()
      const alias = candidateAlias && !reserved.has(candidateAlias) ? match[2]! : table
      refs.push({ table, alias })
    }
    match = pattern.exec(sql)
  }

  return refs
}

function normalizeColumns(columns: string[]): string[] {
  return Array.from(new Set(columns.filter((column) => column.trim().length > 0)))
}

function collectColumnSuggestions(
  tableRefs: SqlTableRef[],
  fieldMap: Record<string, string[]>,
  qualifier?: string
): CompletionSuggestion[] {
  const items: CompletionSuggestion[] = []

  if (qualifier) {
    const ref = tableRefs.find((entry) => entry.alias === qualifier || entry.table === qualifier)
    if (!ref) return []

    const columns = normalizeColumns(fieldMap[ref.table] ?? [])
    return columns.map((column) => ({
      id: `mysql-column-${ref.table}-${column}`,
      label: column,
      kind: "field",
      insertText: column,
      detail: `${ref.table}.${column}`,
    }))
  }

  for (const ref of tableRefs) {
    const columns = normalizeColumns(fieldMap[ref.table] ?? [])
    for (const column of columns) {
      items.push({
        id: `mysql-column-${ref.table}-${column}`,
        label: ref.alias === ref.table ? column : `${ref.alias}.${column}`,
        kind: "field",
        insertText: ref.alias === ref.table ? column : `${ref.alias}.${column}`,
        detail: `${ref.table}.${column}`,
      })
    }
  }

  return items
}

function isWhereContext(beforeCursor: string): boolean {
  const lc = beforeCursor.toLowerCase()
  const whereIndex = lc.lastIndexOf(" where ")
  if (whereIndex < 0) return false

  const blockers = [" group by ", " order by ", " limit ", " having "]
  const blocked = blockers.some((token) => lc.lastIndexOf(token) > whereIndex)
  return !blocked
}

export const mysqlCompletionProvider: CompletionProvider = {
  getCompletions(context: CompletionContext) {
    const bounds = getTokenBounds(context.query, context.cursor)
    const beforeCursor = context.query.slice(0, context.cursor)
    const beforeCursorLower = beforeCursor.toLowerCase()
    const tableRefs = parseTableRefs(beforeCursor)

    const expectTableName = /(?:from|join|into|update|table)\s+`?[a-z0-9_]*$/i.test(beforeCursorLower)
    const qualifierMatch = beforeCursor.match(/([A-Za-z0-9_]+)\.([A-Za-z0-9_]*)$/)
    const qualifier = qualifierMatch?.[1]
    const isWhere = isWhereContext(beforeCursorLower)

    const tableSuggestions: CompletionSuggestion[] = context.schema.collections.map((name) => ({
      id: `mysql-table-${name}`,
      label: name,
      kind: "collection",
      insertText: name,
      detail: `Table in ${context.database}`,
    }))

    const columnSuggestions = collectColumnSuggestions(tableRefs, context.schema.collectionFields, qualifier)
    const snippetSuggestions = context.query.trim() === "" ? SQL_SNIPPETS : []

    const base: CompletionSuggestion[] = expectTableName
      ? [...tableSuggestions, ...SQL_KEYWORDS]
      : qualifier
        ? [...columnSuggestions]
        : isWhere
          ? [...columnSuggestions, ...SQL_KEYWORDS, ...tableSuggestions]
          : [...SQL_KEYWORDS, ...columnSuggestions, ...tableSuggestions, ...snippetSuggestions]

    const searchToken = qualifierMatch ? (qualifierMatch[2] ?? "") : bounds.token
    const items = rankCompletionSuggestions(base, searchToken)
    if (items.length === 0) return null

    const replaceStart = qualifierMatch ? context.cursor - searchToken.length : bounds.start
    const replaceEnd = qualifierMatch ? context.cursor : bounds.end

    return {
      items,
      replaceStart,
      replaceEnd,
    }
  },
}
