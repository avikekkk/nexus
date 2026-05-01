import type { DbType, ConnectionStatus } from "../db/types.ts"
import type { ThemeColors } from "../theme/themes.ts"

/**
 * Nerd Font icons for database types
 * Requires a Nerd Font to be installed (e.g., JetBrains Mono Nerd Font)
 */
export const DB_TYPE_ICONS: Record<DbType, string> = {
  elasticsearch: "\ue7ca", // nf-dev-elasticsearch
  mongo: "\ue7a4", // nf-dev-mongodb_word_mark
  redis: "\ue76d", // nf-dev-redis (cube logo)
  mysql: "\ue704", // nf-dev-mysql (dolphin logo)
  postgres: "\ue76e", // nf-dev-postgresql
}

/**
 * Brand colors for database types
 */
export function getDbTypeColors(colors: ThemeColors): Record<DbType, string> {
  return {
    elasticsearch: colors.warning,
    mongo: colors.success,
    redis: colors.error,
    mysql: colors.accent,
    postgres: colors.info,
  }
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
function getStatusColors(colors: ThemeColors): Record<ConnectionStatus, string> {
  return {
    disconnected: colors.muted,
    connecting: colors.warning,
    connected: colors.success,
    error: colors.error,
  }
}

/**
 * Get icon color based on connection status
 * For connected: use brand color
 * For other states: use status color
 */
export function getIconColor(type: DbType, status: ConnectionStatus, colors: ThemeColors): string {
  if (status === "connected") {
    return getDbTypeColors(colors)[type]
  }
  return getStatusColors(colors)[status]
}
