import { homedir } from "node:os"
import { join } from "node:path"
import { mkdir, readFile, writeFile } from "node:fs/promises"
import { Entry } from "@napi-rs/keyring"
import type { ConnectionConfig } from "../db/types.ts"

const CONFIG_DIR = join(homedir(), ".db-tui")
const CONFIG_FILE = join(CONFIG_DIR, "connections.json")
const KEYRING_SERVICE = "db-tui"

interface StoredConnectionConfig extends Omit<ConnectionConfig, "password" | "url"> {
  password?: never
  url?: never
}

function getPasswordFromKeyring(id: string): string | undefined {
  try {
    const entry = new Entry(KEYRING_SERVICE, `connection:${id}:password`)
    const password = entry.getPassword()
    return password || undefined
  } catch (error) {
    console.warn(`Failed to retrieve password from keyring for connection ${id}:`, error)
    return undefined
  }
}

function setPasswordToKeyring(id: string, password: string): void {
  try {
    const entry = new Entry(KEYRING_SERVICE, `connection:${id}:password`)
    entry.setPassword(password)
  } catch (error) {
    console.error(`Failed to store password in keyring for connection ${id}:`, error)
    throw error
  }
}

function deletePasswordFromKeyring(id: string): void {
  try {
    const entry = new Entry(KEYRING_SERVICE, `connection:${id}:password`)
    entry.deletePassword()
  } catch (error) {
    console.warn(`Failed to delete password from keyring for connection ${id}:`, error)
  }
}

function getUrlFromKeyring(id: string): string | undefined {
  try {
    const entry = new Entry(KEYRING_SERVICE, `connection:${id}:url`)
    const url = entry.getPassword()
    return url || undefined
  } catch (error) {
    console.warn(`Failed to retrieve URL from keyring for connection ${id}:`, error)
    return undefined
  }
}

function setUrlToKeyring(id: string, url: string): void {
  try {
    const entry = new Entry(KEYRING_SERVICE, `connection:${id}:url`)
    entry.setPassword(url)
  } catch (error) {
    console.error(`Failed to store URL in keyring for connection ${id}:`, error)
    throw error
  }
}

function deleteUrlFromKeyring(id: string): void {
  try {
    const entry = new Entry(KEYRING_SERVICE, `connection:${id}:url`)
    entry.deletePassword()
  } catch (error) {
    console.warn(`Failed to delete URL from keyring for connection ${id}:`, error)
  }
}

export async function loadConnections(): Promise<ConnectionConfig[]> {
  try {
    const raw = await readFile(CONFIG_FILE, "utf-8")
    const stored = JSON.parse(raw) as Array<ConnectionConfig | StoredConnectionConfig>

    const connections: ConnectionConfig[] = []
    let needsMigration = false

    for (const conn of stored) {
      // Check if this is old format with plain-text password or url
      if (conn.password || conn.url) {
        needsMigration = true
        // Migrate password and url to keyring
        try {
          if (conn.password) {
            setPasswordToKeyring(conn.id, conn.password)
          }
          if (conn.url) {
            setUrlToKeyring(conn.id, conn.url)
          }
          const { password, url, ...rest } = conn
          connections.push({
            ...rest,
            password: conn.password, // Keep in memory for this session
            url: conn.url,
          })
        } catch (error) {
          console.error(`Failed to migrate credentials for connection ${conn.id}:`, error)
          connections.push(conn as ConnectionConfig)
        }
      } else {
        // Load password and url from keyring
        const password = getPasswordFromKeyring(conn.id)
        const url = getUrlFromKeyring(conn.id)
        connections.push({
          ...(conn as StoredConnectionConfig),
          password,
          url,
        })
      }
    }

    // If we migrated credentials, save the file without them
    if (needsMigration) {
      await saveConnections(connections)
    }

    return connections
  } catch {
    return []
  }
}

export async function saveConnections(connections: ConnectionConfig[]): Promise<void> {
  await mkdir(CONFIG_DIR, { recursive: true })

  // Store passwords and URLs in keyring, save metadata to JSON
  const stored: StoredConnectionConfig[] = []

  for (const conn of connections) {
    if (conn.password) {
      try {
        setPasswordToKeyring(conn.id, conn.password)
      } catch (error) {
        console.error(`Failed to store password for connection ${conn.id}:`, error)
        // Continue anyway - connection will be saved without password
      }
    }

    if (conn.url) {
      try {
        setUrlToKeyring(conn.id, conn.url)
      } catch (error) {
        console.error(`Failed to store URL for connection ${conn.id}:`, error)
        // Continue anyway - connection will be saved without url
      }
    }

    // Exclude password and url from JSON
    const { password, url, ...rest } = conn
    stored.push(rest as StoredConnectionConfig)
  }

  await writeFile(CONFIG_FILE, JSON.stringify(stored, null, 2), "utf-8")
}

async function deleteConnection(id: string): Promise<void> {
  const connections = await loadConnections()
  const filtered = connections.filter((c) => c.id !== id)
  await saveConnections(filtered)
  deletePasswordFromKeyring(id)
  deleteUrlFromKeyring(id)
}

export function generateId(): string {
  return crypto.randomUUID()
}
