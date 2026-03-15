import { homedir } from "node:os"
import { join } from "node:path"
import { mkdir, readFile, writeFile } from "node:fs/promises"
import type { ConnectionConfig } from "../db/types.ts"

const CONFIG_DIR = join(homedir(), ".db-tui")
const CONFIG_FILE = join(CONFIG_DIR, "connections.json")

export async function loadConnections(): Promise<ConnectionConfig[]> {
  try {
    const raw = await readFile(CONFIG_FILE, "utf-8")
    return JSON.parse(raw) as ConnectionConfig[]
  } catch {
    return []
  }
}

export async function saveConnections(connections: ConnectionConfig[]): Promise<void> {
  await mkdir(CONFIG_DIR, { recursive: true })
  await writeFile(CONFIG_FILE, JSON.stringify(connections, null, 2), "utf-8")
}

export function generateId(): string {
  return crypto.randomUUID()
}
