import type { RedisKeyType } from "../db/types.ts"

/**
 * Get the icon for a Redis key type
 * All icons are single-width characters for consistent alignment
 */
export function getRedisTypeIcon(redisType: RedisKeyType | undefined): string {
  if (!redisType) return "◇"

  switch (redisType) {
    case "string":
      return "⚹" // String icon (similar to text/code)
    case "hash":
      return "⚏" // Hash/map icon
    case "list":
      return "≡" // List icon (horizontal lines)
    case "set":
      return "◈" // Set icon (diamond/collection)
    case "zset":
      return "⧉" // Sorted set icon (numbered diamond)
    case "stream":
      return "⧩" // Stream icon (flow/events)
    case "none":
      return "◌" // Empty/none icon
    default:
      return "◇" // Fallback - single-width
  }
}
