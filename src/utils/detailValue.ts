import type { DbType } from "../db/types.ts"

export function formatBytes(value: unknown): string {
  const bytes = Buffer.byteLength(typeof value === "string" ? value : JSON.stringify(value ?? ""), "utf8")
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KiB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MiB`
}

export function stringifyValue(value: unknown): string {
  if (value === null || value === undefined) return "null"
  if (typeof value === "string") return value
  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return String(value)
  }
}

export function parseEditedValue(
  dbType: DbType,
  input: string,
  originalValue: unknown
): { value?: unknown; error?: string } {
  if (dbType === "redis") {
    if (typeof originalValue === "string" || originalValue === null || originalValue === undefined) {
      return { value: input }
    }
    try {
      return { value: JSON.parse(input) }
    } catch {
      return { error: "Invalid JSON for non-string Redis value" }
    }
  }

  if (typeof originalValue === "string") return { value: input }
  if (typeof originalValue === "number") {
    const num = Number(input)
    if (Number.isNaN(num)) return { error: "Expected number" }
    return { value: num }
  }
  if (typeof originalValue === "boolean") {
    if (input === "true") return { value: true }
    if (input === "false") return { value: false }
    return { error: "Expected true or false" }
  }
  if (originalValue === null) {
    if (input === "null") return { value: null }
    try {
      return { value: JSON.parse(input) }
    } catch {
      return { value: input }
    }
  }

  try {
    return { value: JSON.parse(input) }
  } catch {
    return { error: "Invalid JSON" }
  }
}

export function getTypeName(value: unknown): string {
  if (value === null) return "null"
  if (Array.isArray(value)) return "array"
  return typeof value
}
