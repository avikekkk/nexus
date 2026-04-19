import type { DbType, ConnectionStatus } from "../db/types.ts"

/**
 * Nerd Font icons for database types
 * Requires a Nerd Font to be installed (e.g., JetBrains Mono Nerd Font)
 */
export const DB_TYPE_ICONS: Record<DbType, string> = {
  elasticsearch: "\uf0eb", // nf-dev-elasticsearch
  mongo: "\ue7a4", // nf-dev-mongodb_word_mark
  redis: "\ue76d", // nf-dev-redis (cube logo)
  mysql: "\ue704", // nf-dev-mysql (dolphin logo)
  postgres: "\ue76e", // nf-dev-postgresql
}

/**
 * Brand colors for database types
 */
export const DB_TYPE_COLORS: Record<DbType, string> = {
  elasticsearch: "#e0af68", // Yellow/Gold (Elasticsearch brand)
  mongo: "#9ece6a", // Green (MongoDB brand)
  redis: "#f7768e", // Red (Redis brand)
  mysql: "#7aa2f7", // Blue (MySQL brand)
  postgres: "#7dcfff", // Cyan (PostgreSQL-like)
}

/**
 * Status indicators (separate from type icons)
 */
export const STATUS_INDICATORS: Record<ConnectionStatus, string> = {
  disconnected: "○",
  connecting: "◔",
  connected: "●",
  error: "✖",
}

/**
 * Status colors
 */
export const STATUS_COLORS: Record<ConnectionStatus, string> = {
  disconnected: "#565f89",
  connecting: "#e0af68",
  connected: "#9ece6a",
  error: "#f7768e",
}

/**
 * Get icon color based on connection status
 * For connected: use brand color
 * For other states: use status color
 */
export function getIconColor(type: DbType, status: ConnectionStatus): string {
  if (status === "connected") {
    return DB_TYPE_COLORS[type]
  }
  return STATUS_COLORS[status]
}
