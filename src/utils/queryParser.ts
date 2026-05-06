import { ObjectId } from "mongodb"

interface ElasticSearchFilterResult {
  query: Record<string, unknown> | null
  error: string | null
}

interface MongoFilterResult {
  filter: Record<string, unknown> | null
  error: string | null
}

interface MongoRegexLiteral {
  source: string
  flags: string
  end: number
}

interface MySQLQueryResult {
  where: string
  orderBy: string
  limit: number | null
  error: string | null
}

interface RedisPatternResult {
  valid: boolean
  pattern: string
  error: string | null
}

function isMongoIdentifierStart(char: string): boolean {
  return /[A-Za-z_$]/.test(char)
}

function isMongoIdentifierChar(char: string): boolean {
  return /[A-Za-z0-9_$]/.test(char)
}

function getPreviousSignificantChar(input: string, index: number): string | null {
  for (let i = index - 1; i >= 0; i--) {
    const char = input[i]!
    if (!/\s/.test(char)) return char
  }
  return null
}

export function canStartMongoRegexLiteral(input: string, index: number): boolean {
  if (input[index] !== "/") return false
  const next = input[index + 1]
  if (next === "/" || next === "*") return false

  const previous = getPreviousSignificantChar(input, index)
  return previous === null || previous === "(" || previous === "[" || previous === "{" || previous === ":" || previous === ","
}

export function readMongoRegexLiteral(input: string, start: number): MongoRegexLiteral {
  let source = ""
  let i = start + 1
  let escaped = false
  let inCharacterClass = false

  while (i < input.length) {
    const char = input[i]!

    if (escaped) {
      source += char
      escaped = false
      i++
      continue
    }

    if (char === "\\") {
      source += char
      escaped = true
      i++
      continue
    }

    if (char === "[") {
      inCharacterClass = true
      source += char
      i++
      continue
    }

    if (char === "]" && inCharacterClass) {
      inCharacterClass = false
      source += char
      i++
      continue
    }

    if (char === "/" && !inCharacterClass) {
      i++
      break
    }

    source += char
    i++
  }

  if (i > input.length || input[i - 1] !== "/") {
    throw new Error("Unclosed regex literal")
  }

  const flagsStart = i
  while (i < input.length && /[A-Za-z]/.test(input[i]!)) {
    i++
  }

  const flags = input.slice(flagsStart, i)
  try {
    new RegExp(source, flags)
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    throw new Error(`Invalid regex literal: ${msg}`)
  }

  return { source, flags, end: i }
}

function decodeSingleQuotedEscape(char: string): string {
  switch (char) {
    case "\\":
      return "\\"
    case "'":
      return "'"
    case '"':
      return '"'
    case "n":
      return "\n"
    case "r":
      return "\r"
    case "t":
      return "\t"
    case "b":
      return "\b"
    case "f":
      return "\f"
    case "v":
      return "\v"
    case "0":
      return "\0"
    default:
      return char
  }
}

function normalizeMongoSingleQuotedStrings(input: string): string {
  let output = ""
  let inDouble = false
  let inSingle = false
  let singleValue = ""
  let escaped = false

  for (let i = 0; i < input.length; i++) {
    const char = input[i]!

    if (inSingle) {
      if (escaped) {
        singleValue += decodeSingleQuotedEscape(char)
        escaped = false
        continue
      }

      if (char === "\\") {
        escaped = true
        continue
      }

      if (char === "'") {
        output += JSON.stringify(singleValue)
        singleValue = ""
        inSingle = false
        continue
      }

      singleValue += char
      continue
    }

    if (inDouble) {
      output += char
      if (escaped) {
        escaped = false
      } else if (char === "\\") {
        escaped = true
      } else if (char === '"') {
        inDouble = false
      }
      continue
    }

    if (char === '"') {
      inDouble = true
      output += char
      continue
    }

    if (char === "'") {
      inSingle = true
      singleValue = ""
      escaped = false
      continue
    }

    output += char
  }

  if (inSingle) {
    output += `'${singleValue}`
  }

  return output
}

function removeMongoTrailingCommas(input: string): string {
  let output = ""
  let inString: "'" | '"' | null = null
  let escaped = false

  for (let i = 0; i < input.length; i++) {
    const char = input[i]!

    if (inString) {
      output += char
      if (escaped) {
        escaped = false
      } else if (char === "\\") {
        escaped = true
      } else if (char === inString) {
        inString = null
      }
      continue
    }

    if (char === '"' || char === "'") {
      inString = char
      output += char
      continue
    }

    if (char === ",") {
      let j = i + 1
      while (j < input.length && /\s/.test(input[j]!)) {
        j++
      }

      const next = input[j]
      if (next === "}" || next === "]") {
        continue
      }
    }

    output += char
  }

  return output
}

function replaceMongoRegexLiterals(input: string, regexPlaceholders: Array<{ source: string; flags: string }>): string {
  let output = ""
  let inString: "'" | '"' | null = null
  let escaped = false

  for (let i = 0; i < input.length; i++) {
    const char = input[i]!

    if (inString) {
      output += char
      if (escaped) {
        escaped = false
      } else if (char === "\\") {
        escaped = true
      } else if (char === inString) {
        inString = null
      }
      continue
    }

    if (char === '"' || char === "'") {
      inString = char
      output += char
      continue
    }

    if (canStartMongoRegexLiteral(input, i)) {
      const literal = readMongoRegexLiteral(input, i)
      const index = regexPlaceholders.push({ source: literal.source, flags: literal.flags }) - 1
      output += `{"$__regexp":"${index}"}`
      i = literal.end - 1
      continue
    }

    output += char
  }

  return output
}

function normalizeMongoObjectKeys(input: string): string {
  let output = ""
  const stack: Array<{ type: "object" | "array"; expectingKey: boolean }> = []
  let inString: "'" | '"' | null = null
  let escaped = false

  for (let i = 0; i < input.length; i++) {
    const char = input[i]!

    if (inString) {
      output += char
      if (escaped) {
        escaped = false
      } else if (char === "\\") {
        escaped = true
      } else if (char === inString) {
        inString = null
      }
      continue
    }

    if (char === '"' || char === "'") {
      inString = char
      output += char
      continue
    }

    const top = stack[stack.length - 1]

    if (top?.type === "object" && top.expectingKey) {
      if (isMongoIdentifierStart(char)) {
        let j = i + 1
        while (j < input.length && isMongoIdentifierChar(input[j]!)) {
          j++
        }

        let k = j
        while (k < input.length && /\s/.test(input[k]!)) {
          k++
        }

        if (input[k] === ":") {
          const token = input.slice(i, j)
          output += `"${token}"`
          i = j - 1
          continue
        }
      }
    }

    if (char === "{") {
      stack.push({ type: "object", expectingKey: true })
      output += char
      continue
    }

    if (char === "[") {
      stack.push({ type: "array", expectingKey: false })
      output += char
      continue
    }

    if (char === "}") {
      stack.pop()
      output += char
      continue
    }

    if (char === "]") {
      stack.pop()
      output += char
      continue
    }

    if (char === ":") {
      if (top?.type === "object") {
        top.expectingKey = false
      }
      output += char
      continue
    }

    if (char === ",") {
      if (top?.type === "object") {
        top.expectingKey = true
      }
      output += char
      continue
    }

    output += char
  }

  return output
}

function parseMongoDateValue(arg: string): Date {
  const trimmed = arg.trim()
  if (!trimmed) {
    return new Date()
  }

  if ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
    const normalized = normalizeMongoSingleQuotedStrings(trimmed)
    const raw = JSON.parse(normalized)
    if (typeof raw !== "string") {
      throw new Error("new Date() string argument is invalid")
    }
    const date = new Date(raw)
    if (Number.isNaN(date.getTime())) {
      throw new Error("Invalid Date value")
    }
    return date
  }

  if (/^-?\d+(?:\.\d+)?$/.test(trimmed)) {
    const numeric = Number(trimmed)
    if (!Number.isFinite(numeric)) {
      throw new Error("Invalid Date value")
    }
    return new Date(numeric)
  }

  const replacedNow = trimmed.replace(/Date\.now\s*\(\s*\)/g, String(Date.now()))
  if (/[^0-9+\-*/().\s]/.test(replacedNow)) {
    throw new Error("Unsupported new Date() expression")
  }

  let value: unknown
  try {
    value = Function(`"use strict"; return (${replacedNow})`)()
  } catch {
    throw new Error("Invalid new Date() expression")
  }

  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error("Invalid new Date() expression")
  }

  return new Date(value)
}

function replaceMongoDateConstructors(input: string, datePlaceholders: number[]): string {
  let output = ""
  let i = 0
  let inString: "'" | '"' | null = null
  let escaped = false

  while (i < input.length) {
    const char = input[i]!

    if (inString) {
      output += char
      if (escaped) {
        escaped = false
      } else if (char === "\\") {
        escaped = true
      } else if (char === inString) {
        inString = null
      }
      i++
      continue
    }

    if (char === '"' || char === "'") {
      inString = char
      output += char
      i++
      continue
    }

    if (input.startsWith("new Date", i)) {
      let head = i + "new Date".length
      while (head < input.length && /\s/.test(input[head]!)) {
        head++
      }

      if (input[head] !== "(") {
        output += char
        i++
        continue
      }

      let depth = 1
      let j = head + 1
      let quote: "'" | '"' | null = null
      let quoteEscaped = false

      while (j < input.length && depth > 0) {
        const next = input[j]!

        if (quote) {
          if (quoteEscaped) {
            quoteEscaped = false
          } else if (next === "\\") {
            quoteEscaped = true
          } else if (next === quote) {
            quote = null
          }
          j++
          continue
        }

        if (next === '"' || next === "'") {
          quote = next
          j++
          continue
        }

        if (next === "(") depth++
        if (next === ")") depth--
        j++
      }

      if (depth !== 0) {
        throw new Error("Unclosed new Date() expression")
      }

      const arg = input.slice(head + 1, j - 1)
      const date = parseMongoDateValue(arg)
      const index = datePlaceholders.push(date.getTime()) - 1
      output += `{"$__date":"${index}"}`
      i = j
      continue
    }

    output += char
    i++
  }

  return output
}

export function parseMongoExtendedJson(input: string): unknown {
  const objectIdPlaceholders: string[] = []
  const datePlaceholders: number[] = []
  const regexPlaceholders: Array<{ source: string; flags: string }> = []
  let normalized = normalizeMongoSingleQuotedStrings(input)
  normalized = replaceMongoDateConstructors(normalized, datePlaceholders)
  normalized = replaceMongoRegexLiterals(normalized, regexPlaceholders)
  normalized = normalizeMongoObjectKeys(normalized)
  normalized = removeMongoTrailingCommas(normalized)

  normalized = normalized.replace(/ObjectId\s*\(\s*(["'])([a-fA-F0-9]{24})\1\s*\)/g, (_match, _quote, hex: string) => {
    const index = objectIdPlaceholders.push(hex) - 1
    return `{"$__objectId":"${index}"}`
  })

  const parsed = JSON.parse(normalized)

  const revive = (value: unknown): unknown => {
    if (Array.isArray(value)) {
      return value.map(revive)
    }

    if (typeof value !== "object" || value === null) {
      return value
    }

    const record = value as Record<string, unknown>
    const keys = Object.keys(record)
    if (keys.length === 1 && keys[0] === "$__objectId") {
      const raw = record.$__objectId
      const idx = typeof raw === "string" ? Number.parseInt(raw, 10) : -1
      const hex = idx >= 0 ? objectIdPlaceholders[idx] : undefined
      if (!hex || !ObjectId.isValid(hex)) {
        throw new Error("Invalid ObjectId value")
      }
      return new ObjectId(hex)
    }

    if (keys.length === 1 && keys[0] === "$__date") {
      const raw = record.$__date
      const idx = typeof raw === "string" ? Number.parseInt(raw, 10) : -1
      const timestamp = idx >= 0 ? datePlaceholders[idx] : undefined
      if (typeof timestamp !== "number" || !Number.isFinite(timestamp)) {
        throw new Error("Invalid Date value")
      }
      return new Date(timestamp)
    }

    if (keys.length === 1 && keys[0] === "$__regexp") {
      const raw = record.$__regexp
      const idx = typeof raw === "string" ? Number.parseInt(raw, 10) : -1
      const literal = idx >= 0 ? regexPlaceholders[idx] : undefined
      if (!literal) {
        throw new Error("Invalid regex literal")
      }
      return new RegExp(literal.source, literal.flags)
    }

    const next: Record<string, unknown> = {}
    for (const [key, child] of Object.entries(record)) {
      next[key] = revive(child)
    }
    return next
  }

  return revive(parsed)
}

/**
 * Parse MongoDB JSON filter from string input
 * Supports ObjectId("...") and ObjectId('...') shell literals.
 */
export function parseMongoFilter(input: string): MongoFilterResult {
  if (!input || input.trim() === "") {
    return { filter: {}, error: null }
  }

  try {
    const parsed = parseMongoExtendedJson(input)

    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      return { filter: null, error: "Filter must be a JSON object" }
    }

    const dangerousOps = ["$where", "$function", "$accumulator"]
    const checkDangerous = (obj: unknown): boolean => {
      if (typeof obj !== "object" || obj === null) return false
      if (obj instanceof ObjectId || obj instanceof Date) return false

      for (const key of Object.keys(obj)) {
        if (dangerousOps.includes(key)) return true
        const value = (obj as Record<string, unknown>)[key]
        if (typeof value === "object" && checkDangerous(value)) {
          return true
        }
      }
      return false
    }

    if (checkDangerous(parsed)) {
      return { filter: null, error: "Dangerous operators ($where, $function) not allowed" }
    }

    return { filter: parsed as Record<string, unknown>, error: null }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return { filter: null, error: `Invalid JSON: ${msg}` }
  }
}

/**
 * Parse MySQL query string into components
 * Supports WHERE, ORDER BY, LIMIT clauses
 */
export function parseMySQLQuery(input: string): MySQLQueryResult {
  if (!input || input.trim() === "") {
    return { where: "", orderBy: "", limit: null, error: null }
  }

  const trimmed = input.trim()
  
  // Security check: only allow SELECT-like queries
  const dangerous = /\b(DROP|DELETE|UPDATE|INSERT|ALTER|CREATE|TRUNCATE|GRANT|REVOKE)\b/i
  if (dangerous.test(trimmed)) {
    return { where: "", orderBy: "", limit: null, error: "Only SELECT queries allowed" }
  }

  // Extract WHERE clause
  let where = ""
  const whereMatch = trimmed.match(/WHERE\s+(.+?)(?=\s+ORDER\s+BY|\s+LIMIT|$)/i)
  if (whereMatch) {
    where = whereMatch[1]?.trim() ?? ""
  } else if (!trimmed.match(/ORDER\s+BY|LIMIT/i)) {
    // If no WHERE keyword but also no ORDER/LIMIT, treat entire input as WHERE clause
    where = trimmed
  }

  // Extract ORDER BY clause
  let orderBy = ""
  const orderMatch = trimmed.match(/ORDER\s+BY\s+(.+?)(?=\s+LIMIT|$)/i)
  if (orderMatch) {
    orderBy = orderMatch[1]?.trim() ?? ""
  }

  // Extract LIMIT clause
  let limit: number | null = null
  const limitMatch = trimmed.match(/LIMIT\s+(\d+)/i)
  if (limitMatch) {
    const parsed = parseInt(limitMatch[1] ?? "0", 10)
    if (!isNaN(parsed)) {
      limit = parsed
    }
  }

  return { where, orderBy, limit, error: null }
}

/**
 * Validate Redis SCAN pattern
 * Supports *, ?, [], [^] glob patterns
 */
export function validateRedisPattern(input: string): RedisPatternResult {
  if (!input || input.trim() === "") {
    return { valid: true, pattern: "*", error: null }
  }

  const trimmed = input.trim()

  // Check for invalid characters (control chars, nulls)
  if (/[\x00-\x1f\x7f]/.test(trimmed)) {
    return { valid: false, pattern: trimmed, error: "Pattern contains invalid control characters" }
  }

  // Check for extremely long patterns (DoS prevention)
  if (trimmed.length > 256) {
    return { valid: false, pattern: trimmed, error: "Pattern too long (max 256 chars)" }
  }

  // Check for balanced brackets
  let bracketDepth = 0
  for (const char of trimmed) {
    if (char === "[") bracketDepth++
    if (char === "]") bracketDepth--
    if (bracketDepth < 0) {
      return { valid: false, pattern: trimmed, error: "Unbalanced brackets in pattern" }
    }
  }
  if (bracketDepth !== 0) {
    return { valid: false, pattern: trimmed, error: "Unbalanced brackets in pattern" }
  }

  return { valid: true, pattern: trimmed, error: null }
}

/**
 * Parse Elasticsearch query from string input.
 * Supports:
 *   - Full search body: { "query": { "match": { "field": "value" } }, "size": 10 }
 *   - Query DSL directly: { "match": { "field": "value" } } or { "bool": { ... } }
 *   - Simple filter object: { "status": "active" } → converted to match queries
 */
export function parseElasticSearchFilter(input: string): ElasticSearchFilterResult {
  if (!input || input.trim() === "") {
    return { query: { match_all: {} }, error: null }
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(input)
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return { query: null, error: `Invalid JSON: ${msg}` }
  }

  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return { query: null, error: "Query must be a JSON object" }
  }

  const record = parsed as Record<string, unknown>

  // If it has a "query" key, treat as full search body and extract the query
  if ("query" in record && typeof record.query === "object" && record.query !== null) {
    return { query: record.query as Record<string, unknown>, error: null }
  }

  // If it contains known ES query DSL operators, use directly
  const esQueryOperators = [
    "match", "match_phrase", "match_all", "multi_match",
    "term", "terms", "wildcard", "prefix", "regexp",
    "bool", "exists", "ids", "range", "fuzzy",
    "function_score", "simple_query_string", "query_string",
  ]
  const hasEsOperator = Object.keys(record).some((key) => esQueryOperators.includes(key))
  if (hasEsOperator) {
    return { query: record, error: null }
  }

  // Otherwise, treat as a simple filter object and convert to match queries
  const must: Record<string, unknown>[] = []
  for (const [key, value] of Object.entries(record)) {
    if (key === "_id") {
      must.push({ term: { _id: value } })
    } else {
      must.push({ match: { [key]: value } })
    }
  }

  if (must.length === 0) {
    return { query: { match_all: {} }, error: null }
  }
  if (must.length === 1) {
    return { query: must[0]!, error: null }
  }
  return { query: { bool: { must } }, error: null }
}

/**
 * Convert sort object to MySQL ORDER BY clause
 */
export function sortToOrderBy(sort: Record<string, 1 | -1>): string {
  const parts: string[] = []
  for (const [col, dir] of Object.entries(sort)) {
    const direction = dir === 1 ? "ASC" : "DESC"
    // Basic SQL injection prevention: only allow alphanumeric + underscore
    const sanitized = col.replace(/[^a-zA-Z0-9_]/g, "")
    if (sanitized) {
      parts.push(`${sanitized} ${direction}`)
    }
  }
  return parts.join(", ")
}
