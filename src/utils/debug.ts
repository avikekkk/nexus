import { appendFileSync } from "node:fs"

const LOG_FILE = "debug.log"

export function debug(...args: unknown[]) {
  const timestamp = new Date().toISOString().slice(11, 23)
  const msg = args.map((a) => (typeof a === "string" ? a : JSON.stringify(a))).join(" ")
  appendFileSync(LOG_FILE, `[${timestamp}] ${msg}\n`)
}
