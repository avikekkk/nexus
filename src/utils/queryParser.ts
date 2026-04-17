import { ObjectId } from "mongodb"

export interface MongoFilterResult {
  filter: Record<string, unknown> | null
  error: string | null
}

export interface MySQLQueryResult {
  where: string
  orderBy: string
  limit: number | null
  error: string | null
}

export interface RedisPatternResult {
  valid: boolean
  pattern: string
  error: string | null
}

function parseMongoExtendedJson(input: string): unknown {
  const placeholders: string[] = []
  let normalized = input

  normalized = normalized.replace(/ObjectId\s*\(\s*(["'])([a-fA-F0-9]{24})\1\s*\)/g, (_match, _quote, hex: string) => {
    const index = placeholders.push(hex) - 1
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
      const hex = idx >= 0 ? placeholders[idx] : undefined
      if (!hex || !ObjectId.isValid(hex)) {
        throw new Error("Invalid ObjectId value")
      }
      return new ObjectId(hex)
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
      if (obj instanceof ObjectId) return false

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

/**
 * Parse ORDER BY clause into sort object
 */
export function orderByToSort(orderBy: string): Record<string, 1 | -1> {
  const sort: Record<string, 1 | -1> = {}
  if (!orderBy) return sort

  const parts = orderBy.split(",")
  for (const part of parts) {
    const match = part.trim().match(/^(\w+)\s+(ASC|DESC)$/i)
    if (match) {
      const col = match[1]!
      const dir = match[2]!.toUpperCase() === "DESC" ? -1 : 1
      sort[col] = dir
    } else {
      // No direction specified, default to ASC
      const col = part.trim().replace(/[^a-zA-Z0-9_]/g, "")
      if (col) {
        sort[col] = 1
      }
    }
  }
  return sort
}
