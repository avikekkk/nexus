import Redis from "ioredis"
import type { DbDriver, CollectionInfo, ColumnDef, CollectionPage, RedisKeyType } from "./types.ts"
import { debug } from "../utils/debug.ts"

const REDIS_SCAN_COUNT = 100
const REDIS_SIDEBAR_PAGE_SIZE = 20
const REDIS_SEARCH_PAGE_SIZE = 100

interface ScanRedisKeysOptions {
  cursor?: string
  limit?: number
  count?: number
}

function hasRedisGlob(pattern: string): boolean {
  return /[*?\[\]]/.test(pattern)
}

function escapeRedisGlobLiteral(value: string): string {
  return value.replace(/[\\*?\[\]]/g, "\\$&")
}

export async function buildRedisCollectionInfos(redis: Redis, keys: string[]): Promise<CollectionInfo[]> {
  const infos: CollectionInfo[] = []
  
  for (const key of keys) {
    const keyType = (await redis.type(key)) as RedisKeyType
    infos.push({ name: key, type: "key", count: 1, redisType: keyType })
  }
  
  return infos
}

async function scanRedisKeys(
  redis: Redis,
  pattern: string,
  { cursor = "0", limit, count = REDIS_SCAN_COUNT }: ScanRedisKeysOptions = {}
): Promise<{ keys: string[]; nextCursor: string | null }> {
  const keys: string[] = []
  let nextCursor = cursor

  do {
    const [scannedCursor, batch] = await redis.scan(nextCursor, "MATCH", pattern, "COUNT", count)
    nextCursor = scannedCursor

    for (const key of batch) {
      keys.push(key)
      if (limit != null && keys.length >= limit) {
        return { keys, nextCursor: nextCursor === "0" ? null : nextCursor }
      }
    }
  } while (nextCursor !== "0")

  return { keys, nextCursor: null }
}

export function createRedisDriver(): DbDriver {
  let redis: Redis | null = null

  async function getKeyValue(key: string): Promise<{ type: string; value: string }> {
    if (!redis) throw new Error("Not connected")
    const keyType = await redis.type(key)

    let value: string
    switch (keyType) {
      case "string":
        value = (await redis.get(key)) ?? ""
        break
      case "hash":
        value = JSON.stringify(await redis.hgetall(key))
        break
      case "list":
        value = JSON.stringify(await redis.lrange(key, 0, -1))
        break
      case "set":
        value = JSON.stringify(await redis.smembers(key))
        break
      case "zset": {
        const members = await redis.zrange(key, 0, -1, "WITHSCORES")
        const pairs: Record<string, string> = {}
        for (let i = 0; i < members.length; i += 2) {
          pairs[members[i]!] = members[i + 1]!
        }
        value = JSON.stringify(pairs)
        break
      }
      default:
        value = `<${keyType}>`
    }
    return { type: keyType, value }
  }

  return {
    type: "redis",

    async connect(config) {
      redis = new Redis({
        host: config.host,
        port: config.port,
        password: config.password || undefined,
        username: config.username || undefined,
        db: parseInt(config.database || "0", 10),
        tls: config.tls ? {} : undefined,
        lazyConnect: true,
      })
      await redis.connect()
    },

    async disconnect() {
      if (redis) {
        await redis.quit()
        redis = null
      }
    },

    isConnected() {
      return redis?.status === "ready"
    },

    async listDatabases() {
      if (!redis) throw new Error("Not connected")
      try {
        const result = (await redis.config("GET", "databases")) as string[]
        const count = parseInt(result[1] ?? "16", 10)
        return Array.from({ length: count }, (_, i) => String(i))
      } catch {
        debug("[redis.listDatabases] CONFIG GET failed, falling back to 16 databases")
        return Array.from({ length: 16 }, (_, i) => String(i))
      }
    },

    async listCollectionsPage(db, cursor = null, limit = REDIS_SIDEBAR_PAGE_SIZE): Promise<CollectionPage> {
      if (!redis) throw new Error("Not connected")

      const selectedDb = parseInt(db, 10)
      const startCursor = cursor ?? "0"

      await redis.select(selectedDb)

      const page = await scanRedisKeys(redis, "*", { cursor: startCursor, limit })
      const items = await buildRedisCollectionInfos(redis, page.keys)

      return { items, nextCursor: page.nextCursor }
    },

    async searchCollectionsPage(db, query, cursor = null, limit = REDIS_SEARCH_PAGE_SIZE): Promise<CollectionPage> {
      if (!redis) throw new Error("Not connected")

      const selectedDb = parseInt(db, 10)
      const trimmedQuery = query.trim()
      // Use glob pattern directly if user provides one, otherwise wrap with wildcards
      const pattern = trimmedQuery
        ? hasRedisGlob(trimmedQuery)
          ? trimmedQuery
          : `*${escapeRedisGlobLiteral(trimmedQuery)}*`
        : "*"

      await redis.select(selectedDb)

      debug(`[redis.searchCollectionsPage] db=${db} query=${JSON.stringify(trimmedQuery)} pattern=${JSON.stringify(pattern)}`)

      // Check for exact match first (if no glob chars)
      if (trimmedQuery && !hasRedisGlob(trimmedQuery)) {
        const exists = await redis.exists(trimmedQuery)
        debug(`[redis.searchCollectionsPage] exact exists=${exists} key=${JSON.stringify(trimmedQuery)}`)
        if (exists > 0) {
          return { items: await buildRedisCollectionInfos(redis, [trimmedQuery]), nextCursor: null, totalCount: 1 }
        }
      }

      // Use KEYS for search (fast, returns all matches immediately)
      // For empty query, use SCAN to avoid blocking on large keyspaces
      if (trimmedQuery) {
        const keys = await redis.keys(pattern)
        debug(`[redis.searchCollectionsPage] KEYS result count=${keys.length}`)
        // Apply limit for display, but return total count
        const limitedKeys = keys.slice(0, limit)
        return {
          items: await buildRedisCollectionInfos(redis, limitedKeys),
          nextCursor: keys.length > limit ? "has_more" : null,
          totalCount: keys.length,
        }
      }

      // Empty query - use SCAN to avoid blocking
      const startCursor = cursor ?? "0"
      const [page, totalCount] = await Promise.all([
        scanRedisKeys(redis, pattern, { cursor: startCursor, limit }),
        redis.dbsize(),
      ])

      debug(
        `[redis.searchCollectionsPage] SCAN result count=${page.keys.length} nextCursor=${page.nextCursor ?? "null"} totalCount=${totalCount}`
      )

      return {
        items: await buildRedisCollectionInfos(redis, page.keys),
        nextCursor: page.nextCursor,
        totalCount,
      }
    },

    async countCollections(db) {
      if (!redis) throw new Error("Not connected")
      await redis.select(parseInt(db, 10))
      return redis.dbsize()
    },

    async listCollections(db) {
      if (!redis) throw new Error("Not connected")
      await redis.select(parseInt(db, 10))
      const { keys } = await scanRedisKeys(redis, "*")
      return buildRedisCollectionInfos(redis, keys)
    },

    async query(opts) {
      if (!redis) throw new Error("Not connected")
      await redis.select(parseInt(opts.database, 10))

      const start = performance.now()
      const pattern = opts.collection || "*"

      const limit = opts.limit ?? 50
      const offset = opts.offset ?? 0
      let totalCount = 0
      let pagedKeys: string[] = []

      if (!hasRedisGlob(pattern)) {
        const exists = await redis.exists(pattern)
        totalCount = exists > 0 ? 1 : 0
        pagedKeys = offset === 0 && exists > 0 ? [pattern] : []
      } else {
        const { keys: allKeys } = await scanRedisKeys(redis, pattern)
        totalCount = allKeys.length
        pagedKeys = allKeys.slice(offset, offset + limit)
      }

      const columns: ColumnDef[] = [
        { name: "key", type: "string" },
        { name: "type", type: "string" },
        { name: "value", type: "string" },
        { name: "ttl", type: "number" },
      ]

      const rows: Record<string, unknown>[] = []
      for (const key of pagedKeys) {
        const { type, value } = await getKeyValue(key)
        const ttl = await redis.ttl(key)
        rows.push({ key, type, value, ttl: ttl === -1 ? null : ttl })
      }

      const duration = Math.round(performance.now() - start)
      const queryStr = `SCAN 0 MATCH ${pattern} COUNT 100`

      return { columns, rows, totalCount, duration, query: queryStr }
    },
  }
}
