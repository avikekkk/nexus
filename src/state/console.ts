export type LogLevel = "info" | "success" | "warning" | "error"
export type LogSource = "connection" | "query" | "system"

export interface ConsoleEntry {
  id: number
  timestamp: Date
  level: LogLevel
  source: LogSource
  message: string
}

export const LOG_COLORS: Record<LogLevel, string> = {
  info: "#7aa2f7",
  success: "#9ece6a",
  warning: "#e0af68",
  error: "#f7768e",
}

export const SOURCE_COLORS: Record<LogSource, string> = {
  connection: "#bb9af7",
  query: "#7dcfff",
  system: "#565f89",
}

let nextId = 1
const MAX_ENTRIES = 200

export function createConsoleState() {
  const entries: ConsoleEntry[] = []

  function add(level: LogLevel, source: LogSource, message: string): ConsoleEntry {
    const entry: ConsoleEntry = {
      id: nextId++,
      timestamp: new Date(),
      level,
      source,
      message,
    }
    entries.push(entry)
    if (entries.length > MAX_ENTRIES) {
      entries.splice(0, entries.length - MAX_ENTRIES)
    }
    return entry
  }

  return {
    entries,
    add,
    info: (source: LogSource, message: string) => add("info", source, message),
    success: (source: LogSource, message: string) => add("success", source, message),
    warn: (source: LogSource, message: string) => add("warning", source, message),
    error: (source: LogSource, message: string) => add("error", source, message),
  }
}

export function formatTimestamp(date: Date): string {
  const h = String(date.getHours()).padStart(2, "0")
  const m = String(date.getMinutes()).padStart(2, "0")
  const s = String(date.getSeconds()).padStart(2, "0")
  return `${h}:${m}:${s}`
}
