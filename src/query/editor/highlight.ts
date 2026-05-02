import type { DbType } from "../../db/types.ts"

export type QueryTokenRole = "text" | "keyword" | "function" | "field" | "string" | "number" | "operator" | "comment" | "error"

export interface QueryToken {
  start: number
  end: number
  text: string
  role: QueryTokenRole
}

export interface HighlightedQueryLine {
  start: number
  end: number
  tokens: QueryToken[]
}

export interface FormatQueryResult {
  query: string
  cursor: number
  changed: boolean
}

const MAX_HIGHLIGHT_CHARS = 30_000

const SQL_KEYWORDS = new Set([
  "select",
  "from",
  "where",
  "join",
  "left",
  "right",
  "inner",
  "outer",
  "full",
  "cross",
  "on",
  "and",
  "or",
  "not",
  "in",
  "like",
  "is",
  "null",
  "as",
  "distinct",
  "group",
  "by",
  "order",
  "having",
  "limit",
  "offset",
  "insert",
  "into",
  "update",
  "delete",
  "values",
  "set",
  "returning",
  "case",
  "when",
  "then",
  "else",
  "end",
  "true",
  "false",
])

const SQL_FUNCTIONS = new Set([
  "avg",
  "count",
  "date",
  "max",
  "min",
  "now",
  "sum",
  "coalesce",
  "lower",
  "upper",
])

const MONGO_KEYWORDS = new Set(["db", "true", "false", "null", "undefined", "new"])
const MONGO_FUNCTIONS = new Set([
  "aggregate",
  "countDocuments",
  "find",
  "findOne",
  "limit",
  "ObjectId",
  "skip",
  "sort",
  "Date",
])

const ELASTIC_OPERATORS = new Set([
  "aggs",
  "aggregations",
  "bool",
  "filter",
  "from",
  "gte",
  "gt",
  "highlight",
  "lte",
  "lt",
  "match",
  "match_all",
  "must",
  "must_not",
  "post_filter",
  "query",
  "range",
  "should",
  "size",
  "sort",
  "term",
  "terms",
])

const REDIS_COMMANDS = new Set([
  "del",
  "exists",
  "get",
  "hget",
  "hgetall",
  "hkeys",
  "hset",
  "keys",
  "lrange",
  "lset",
  "scan",
  "set",
  "smembers",
  "type",
  "xrange",
  "zrange",
])

function isWordStart(char: string): boolean {
  return /[A-Za-z_$]/.test(char)
}

function isWordChar(char: string): boolean {
  return /[A-Za-z0-9_$]/.test(char)
}

function isNumberStart(input: string, index: number): boolean {
  const char = input[index] ?? ""
  const next = input[index + 1] ?? ""
  return /[0-9]/.test(char) || (char === "-" && /[0-9]/.test(next))
}

function isOperatorChar(char: string): boolean {
  return /[{}[\]().,;:+\-*/%=<>!|&?]/.test(char)
}

function nextNonSpace(input: string, index: number): string {
  let cursor = index
  while (cursor < input.length && /\s/.test(input[cursor] ?? "")) cursor += 1
  return input[cursor] ?? ""
}

function previousNonSpace(input: string, index: number): string {
  let cursor = index
  while (cursor >= 0 && /\s/.test(input[cursor] ?? "")) cursor -= 1
  return input[cursor] ?? ""
}

function pushToken(tokens: QueryToken[], input: string, start: number, end: number, role: QueryTokenRole): void {
  if (end <= start) return
  tokens.push({ start, end, text: input.slice(start, end), role })
}

function readString(input: string, start: number): number {
  const quote = input[start]
  let cursor = start + 1
  let escaped = false

  while (cursor < input.length) {
    const char = input[cursor]
    if (escaped) {
      escaped = false
    } else if (char === "\\") {
      escaped = true
    } else if (char === quote) {
      return cursor + 1
    }
    cursor += 1
  }

  return input.length
}

function readLineComment(input: string, start: number): number {
  const newline = input.indexOf("\n", start)
  return newline < 0 ? input.length : newline
}

function readBlockComment(input: string, start: number): number {
  const end = input.indexOf("*/", start + 2)
  return end < 0 ? input.length : end + 2
}

function readNumber(input: string, start: number): number {
  let cursor = start
  if (input[cursor] === "-") cursor += 1
  while (cursor < input.length && /[0-9]/.test(input[cursor] ?? "")) cursor += 1
  if (input[cursor] === ".") {
    cursor += 1
    while (cursor < input.length && /[0-9]/.test(input[cursor] ?? "")) cursor += 1
  }
  return cursor
}

function readWord(input: string, start: number): number {
  let cursor = start + 1
  while (cursor < input.length && isWordChar(input[cursor] ?? "")) cursor += 1
  return cursor
}

function roleForWord(input: string, start: number, end: number, dbType: DbType): QueryTokenRole {
  const word = input.slice(start, end)
  const lower = word.toLowerCase()
  const next = nextNonSpace(input, end)
  const previous = previousNonSpace(input, start - 1)

  if (dbType === "mysql" || dbType === "postgres") {
    if (SQL_KEYWORDS.has(lower)) return "keyword"
    if (SQL_FUNCTIONS.has(lower) && next === "(") return "function"
    if (next === "." || previous === "." || next === ":") return "field"
    return "text"
  }

  if (dbType === "mongo") {
    if (word.startsWith("$")) return "operator"
    if (MONGO_KEYWORDS.has(word) || MONGO_KEYWORDS.has(lower)) return "keyword"
    if (MONGO_FUNCTIONS.has(word) || next === "(") return "function"
    if (next === ":" || next === "." || previous === ".") return "field"
    return "text"
  }

  if (dbType === "elasticsearch") {
    if (next === ":") return ELASTIC_OPERATORS.has(lower) ? "operator" : "field"
    if (ELASTIC_OPERATORS.has(lower)) return "operator"
    if (lower === "true" || lower === "false" || lower === "null") return "keyword"
    return "text"
  }

  if (REDIS_COMMANDS.has(lower)) return "function"
  if (word.includes("*")) return "operator"
  return "field"
}

function roleForString(input: string, start: number, end: number, dbType: DbType): QueryTokenRole {
  const body = input.slice(start + 1, Math.max(start + 1, end - 1))
  const next = nextNonSpace(input, end)
  if (dbType === "mongo" && next === ":") {
    return body.startsWith("$") ? "operator" : "field"
  }
  if (dbType === "elasticsearch" && next === ":") {
    return ELASTIC_OPERATORS.has(body) ? "operator" : "field"
  }
  return "string"
}

export function tokenizeQuery(query: string, dbType: DbType): QueryToken[] {
  if (query.length > MAX_HIGHLIGHT_CHARS) {
    return [{ start: 0, end: query.length, text: query, role: "text" }]
  }

  const tokens: QueryToken[] = []
  let cursor = 0

  while (cursor < query.length) {
    const char = query[cursor] ?? ""
    const next = query[cursor + 1] ?? ""

    if (/\s/.test(char)) {
      const start = cursor
      while (cursor < query.length && /\s/.test(query[cursor] ?? "")) cursor += 1
      pushToken(tokens, query, start, cursor, "text")
      continue
    }

    if ((char === "-" && next === "-") || char === "#") {
      const end = readLineComment(query, cursor)
      pushToken(tokens, query, cursor, end, "comment")
      cursor = end
      continue
    }

    if ((char === "/" && next === "/") || (char === "/" && next === "*")) {
      const end = next === "/" ? readLineComment(query, cursor) : readBlockComment(query, cursor)
      pushToken(tokens, query, cursor, end, "comment")
      cursor = end
      continue
    }

    if (char === '"' || char === "'" || char === "`") {
      const end = readString(query, cursor)
      pushToken(tokens, query, cursor, end, roleForString(query, cursor, end, dbType))
      cursor = end
      continue
    }

    if (isNumberStart(query, cursor)) {
      const end = readNumber(query, cursor)
      pushToken(tokens, query, cursor, end, "number")
      cursor = end
      continue
    }

    if (isWordStart(char)) {
      const end = readWord(query, cursor)
      pushToken(tokens, query, cursor, end, roleForWord(query, cursor, end, dbType))
      cursor = end
      continue
    }

    pushToken(tokens, query, cursor, cursor + 1, isOperatorChar(char) ? "operator" : "text")
    cursor += 1
  }

  return tokens
}

export function highlightQueryLines(query: string, dbType: DbType): HighlightedQueryLine[] {
  const tokens = tokenizeQuery(query, dbType)
  const lines: HighlightedQueryLine[] = []
  let lineStart = 0
  let tokenIndex = 0

  while (lineStart <= query.length) {
    const newline = query.indexOf("\n", lineStart)
    const lineEnd = newline < 0 ? query.length : newline
    const lineTokens: QueryToken[] = []

    while (tokenIndex < tokens.length) {
      const token = tokens[tokenIndex]!
      if (token.start >= lineEnd) break

      const start = Math.max(token.start, lineStart)
      const end = Math.min(token.end, lineEnd)
      pushToken(lineTokens, query, start, end, token.role)

      if (token.end <= lineEnd) {
        tokenIndex += 1
      } else {
        break
      }
    }

    lines.push({ start: lineStart, end: lineEnd, tokens: lineTokens })

    if (newline < 0) break
    lineStart = newline + 1
    while (tokenIndex < tokens.length && tokens[tokenIndex]!.end <= lineStart) tokenIndex += 1
  }

  return lines
}

function hasBalancedStructure(input: string): boolean {
  const stack: string[] = []
  let cursor = 0

  while (cursor < input.length) {
    const char = input[cursor] ?? ""
    if (char === '"' || char === "'" || char === "`") {
      const end = readString(input, cursor)
      if (end === input.length && input[end - 1] !== char) return false
      cursor = end
      continue
    }

    if (char === "{" || char === "[") {
      stack.push(char)
    } else if (char === "}" || char === "]") {
      const open = stack.pop()
      if ((char === "}" && open !== "{") || (char === "]" && open !== "[")) return false
    }

    cursor += 1
  }

  return stack.length === 0
}

function prettyStructuralQuery(input: string): string | null {
  if (!hasBalancedStructure(input)) return null

  let output = ""
  let indent = 0
  let cursor = 0

  const appendIndent = () => {
    output += "  ".repeat(indent)
  }

  while (cursor < input.length) {
    const char = input[cursor] ?? ""

    if (char === '"' || char === "'" || char === "`") {
      const end = readString(input, cursor)
      output += input.slice(cursor, end)
      cursor = end
      continue
    }

    if (/\s/.test(char)) {
      cursor += 1
      continue
    }

    if (char === "{" || char === "[") {
      output += char
      indent += 1
      output += "\n"
      appendIndent()
      cursor += 1
      continue
    }

    if (char === "}" || char === "]") {
      indent = Math.max(0, indent - 1)
      output = output.trimEnd()
      output += "\n"
      appendIndent()
      output += char
      cursor += 1
      continue
    }

    if (char === ",") {
      output += ",\n"
      appendIndent()
      cursor += 1
      continue
    }

    if (char === ":") {
      output += ": "
      cursor += 1
      continue
    }

    output += char
    cursor += 1
  }

  return output.trim()
}

function formatSqlQuery(input: string): string {
  return input
    .trim()
    .replace(/\s+/g, " ")
    .replace(/\s+(FROM|WHERE|GROUP BY|ORDER BY|HAVING|LIMIT|OFFSET|RETURNING)\b/gi, "\n$1")
    .replace(/\s+((?:LEFT|RIGHT|INNER|FULL|CROSS)?\s*JOIN)\b/gi, "\n$1")
    .replace(/\s+(AND|OR)\b/gi, "\n  $1")
}

function formatRedisQuery(input: string): string {
  return input
    .split("\n")
    .map((line) => line.trim().replace(/\s+/g, " "))
    .join("\n")
    .trim()
}

function formatJsonQuery(input: string): string | null {
  try {
    return JSON.stringify(JSON.parse(input), null, 2)
  } catch {
    return null
  }
}

export function formatQuery(query: string, dbType: DbType, cursor = query.length): FormatQueryResult {
  const trimmed = query.trim()
  if (!trimmed) return { query, cursor, changed: false }

  let formatted: string | null

  if (dbType === "mysql" || dbType === "postgres") {
    formatted = formatSqlQuery(query)
  } else if (dbType === "redis") {
    formatted = formatRedisQuery(query)
  } else if (dbType === "elasticsearch") {
    formatted = formatJsonQuery(trimmed)
  } else {
    formatted = formatJsonQuery(trimmed) ?? prettyStructuralQuery(query)
  }

  if (!formatted || formatted === query) {
    return { query, cursor, changed: false }
  }

  return {
    query: formatted,
    cursor: cursor >= query.length ? formatted.length : Math.min(cursor, formatted.length),
    changed: true,
  }
}
