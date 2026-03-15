import Redis from "ioredis"
import type { ConnectionConfig, DbDriver, QueryOpts, QueryResult, CollectionInfo, ColumnDef } from "./types.ts"

export function createRedisDriver(): DbDriver {
  let redis: Redis | null = null

  async function scanKeys(pattern: string, count: number = 100): Promise<string[]> {
    if (!redis) throw new Error("Not connected")
    const keys: string[] = []
    let cursor = "0"
    do {
      const [nextCursor, batch] = await redis.scan(cursor, "MATCH", pattern, "COUNT", count)
      cursor = nextCursor
      keys.push(...batch)
    } while (cursor !== "0")
    return keys
  }

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
        return Array.from({ length: 16 }, (_, i) => String(i))
      }
    },

    async listCollections(db) {
      if (!redis) throw new Error("Not connected")
      await redis.select(parseInt(db, 10))
      const keys = await scanKeys("*")

      const groups = new Map<string, number>()
      for (const key of keys) {
        const colonIdx = key.indexOf(":")
        const prefix = colonIdx > 0 ? key.slice(0, colonIdx) : key
        groups.set(prefix, (groups.get(prefix) ?? 0) + 1)
      }

      const infos: CollectionInfo[] = []
      for (const [name, count] of groups) {
        const hasSubkeys = keys.some((k) => k.startsWith(name + ":"))
        infos.push({ name, type: hasSubkeys ? "keyspace" : "key", count })
      }

      return infos.sort((a, b) => a.name.localeCompare(b.name))
    },

    async query(opts) {
      if (!redis) throw new Error("Not connected")
      await redis.select(parseInt(opts.database, 10))

      const start = performance.now()
      const pattern = opts.collection || "*"
      const allKeys = await scanKeys(pattern)

      const limit = opts.limit ?? 50
      const offset = opts.offset ?? 0
      const pagedKeys = allKeys.slice(offset, offset + limit)

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

      return { columns, rows, totalCount: allKeys.length, duration, query: queryStr }
    },
  }
}
