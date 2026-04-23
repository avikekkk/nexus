import type { DbType } from "./types.ts"
import { DEFAULT_PORTS } from "./types.ts"

const VALID_SCHEMES: Record<DbType, string[]> = {
  elasticsearch: ["http", "https"],
  mongo: ["mongodb", "mongodb+srv"],
  mysql: ["mysql"],
  postgres: ["postgres", "postgresql"],
  redis: ["redis", "rediss"],
}

interface ParsedUrl {
  host: string
  port: number
  username?: string
  password?: string
  database?: string
  tls?: boolean
}

interface UrlValidationResult {
  valid: boolean
  error?: string
  parsed?: ParsedUrl
}

export function parseConnectionUrl(url: string, dbType: DbType): UrlValidationResult {
  const trimmed = url.trim()
  if (!trimmed) {
    return { valid: false, error: "URL is empty" }
  }

  const schemes = VALID_SCHEMES[dbType]
  const schemePart = trimmed.split("://")[0]
  if (!schemePart || !schemes.includes(schemePart)) {
    return { valid: false, error: `Invalid scheme. Expected: ${schemes.join(" or ")}://` }
  }

  let parsed: URL
  try {
    // mongodb+srv uses non-standard scheme, normalize for URL parser
    const normalized = trimmed.replace(/^mongodb\+srv:/, "mongodb:")
    parsed = new URL(normalized)
  } catch {
    return { valid: false, error: "Malformed URL" }
  }

  const host = parsed.hostname
  if (!host) {
    return { valid: false, error: "Missing host" }
  }

  const isSrv = schemePart === "mongodb+srv"
  const isTls = schemePart === "rediss"

  const port = parsed.port ? parseInt(parsed.port, 10) : isSrv ? undefined : DEFAULT_PORTS[dbType]
  if (port !== undefined && (isNaN(port) || port < 1 || port > 65535)) {
    return { valid: false, error: "Invalid port number" }
  }

  // SRV records should not have a port
  if (isSrv && parsed.port) {
    return { valid: false, error: "mongodb+srv URLs must not include a port" }
  }

  const username = parsed.username ? decodeURIComponent(parsed.username) : undefined
  const password = parsed.password ? decodeURIComponent(parsed.password) : undefined

  // Database is the pathname without leading slash
  const database = parsed.pathname && parsed.pathname.length > 1 ? parsed.pathname.slice(1) : undefined

  return {
    valid: true,
    parsed: {
      host,
      port: port ?? DEFAULT_PORTS[dbType],
      username,
      password,
      database,
      tls: isTls || undefined,
    },
  }
}
