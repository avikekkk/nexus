import type { DbType } from "../db/types.ts"

export function formatBytes(value: unknown): string {
  const bytes = Buffer.byteLength(typeof value === "string" ? value : JSON.stringify(value ?? ""), "utf8")
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KiB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MiB`
}

function toRawUnicode(text: string): string {
  let output = ""
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i)
    if ((code >= 0x20 && code <= 0x7e) || code === 0x0a || code === 0x0d || code === 0x09) {
      output += text[i]
      continue
    }
    output += `\\u${code.toString(16).padStart(4, "0")}`
  }
  return output
}

export function stringifyValue(value: unknown): string {
  if (value === null || value === undefined) return "null"
  if (typeof value === "string") return toRawUnicode(value)
  try {
    return toRawUnicode(JSON.stringify(value, null, 2))
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
