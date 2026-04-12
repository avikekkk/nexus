import Redis from "ioredis"
import type {
  DbDriver,
  CollectionInfo,
  ColumnDef,
  CollectionPage,
  RedisKeyType,
  UpdateFieldOpts,
  UpdateFieldResult,
} from "./types.ts"
import { debug } from "../utils/debug.ts"
import { validateRedisPattern } from "../utils/queryParser.ts"

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
  if (keys.length === 0) return []

  // Pipeline TYPE commands for all keys at once
  const pipeline = redis.pipeline()
  for (const key of keys) {
    pipeline.type(key)
  }
  const results = await pipeline.exec()

  return keys.map((key, i) => {
    const redisType = (results?.[i]?.[1] as RedisKeyType) ?? undefined
    return { name: key, type: "key" as const, count: 1, redisType }
  })
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

  async function querySingleKey(
    key: string,
    limit: number,
    offset: number
  ): Promise<{ columns: ColumnDef[]; rows: Record<string, unknown>[]; totalCount: number; query: string }> {
    if (!redis) throw new Error("Not connected")
    const keyType = await redis.type(key)
    const ttl = await redis.ttl(key)
    const ttlVal = ttl === -1 ? null : ttl

    switch (keyType) {
      case "string": {
        const value = (await redis.get(key)) ?? ""
        return {
          columns: [
            { name: "key", type: "string" },
            { name: "value", type: "string" },
            { name: "ttl", type: "number" },
          ],
          rows: offset === 0 ? [{ key, value, ttl: ttlVal }] : [],
          totalCount: 1,
          query: `GET ${key}`,
        }
      }

      case "hash": {
        const allFields = await redis.hkeys(key)
        const totalCount = allFields.length
        const pageFields = allFields.slice(offset, offset + limit)
        const rows: Record<string, unknown>[] = []
        if (pageFields.length > 0) {
          const values = await redis.hmget(key, ...pageFields)
          for (let i = 0; i < pageFields.length; i++) {
            rows.push({ field: pageFields[i], value: values[i], ttl: i === 0 && offset === 0 ? ttlVal : null })
          }
        }
        return {
          columns: [
            { name: "field", type: "string" },
            { name: "value", type: "string" },
            { name: "ttl", type: "number" },
          ],
          rows,
          totalCount,
          query: `HKEYS ${key} (${totalCount} fields)`,
        }
      }

      case "list": {
        const totalCount = await redis.llen(key)
        const elements = await redis.lrange(key, offset, offset + limit - 1)
        const rows = elements.map((value, i) => ({
          index: offset + i,
          value,
          ttl: i === 0 && offset === 0 ? ttlVal : null,
        }))
        return {
          columns: [
            { name: "index", type: "number" },
            { name: "value", type: "string" },
            { name: "ttl", type: "number" },
          ],
          rows,
          totalCount,
          query: `LRANGE ${key} ${offset} ${offset + limit - 1} (${totalCount} elements)`,
        }
      }

      case "set": {
        const totalCount = await redis.scard(key)
        const allMembers = await redis.smembers(key)
        const pageMembers = allMembers.slice(offset, offset + limit)
        const rows = pageMembers.map((member) => ({
          member,
          ttl: null as number | null,
        }))
        if (rows.length > 0 && offset === 0) rows[0]!.ttl = ttlVal
        return {
          columns: [
            { name: "member", type: "string" },
            { name: "ttl", type: "number" },
          ],
          rows,
          totalCount,
          query: `SMEMBERS ${key} (${totalCount} members)`,
        }
      }

      case "zset": {
        const totalCount = await redis.zcard(key)
        const members = await redis.zrange(key, offset, offset + limit - 1, "WITHSCORES")
        const rows: Record<string, unknown>[] = []
        for (let i = 0; i < members.length; i += 2) {
          rows.push({
            member: members[i],
            score: parseFloat(members[i + 1]!),
            ttl: rows.length === 0 && offset === 0 ? ttlVal : null,
          })
        }
        return {
          columns: [
            { name: "member", type: "string" },
            { name: "score", type: "number" },
            { name: "ttl", type: "number" },
          ],
          rows,
          totalCount,
          query: `ZRANGE ${key} ${offset} ${offset + limit - 1} WITHSCORES (${totalCount} members)`,
        }
      }

      case "stream": {
        const totalCount = await redis.xlen(key)
        const entries = await redis.xrange(key, "-", "+", "COUNT", limit)
        // Skip `offset` entries — XRANGE doesn't support offset natively,
        // so for non-zero offset we use the ID of the last skipped entry
        let pageEntries = entries
        if (offset > 0) {
          const skipEntries = await redis.xrange(key, "-", "+", "COUNT", offset + limit)
          pageEntries = skipEntries.slice(offset)
        }

        // Collect all field names across entries for dynamic columns
        const fieldSet = new Set<string>()
        for (const [, fields] of pageEntries) {
          for (let i = 0; i < fields.length; i += 2) {
            fieldSet.add(fields[i]!)
          }
        }
        const fieldNames = [...fieldSet]

        const columns: ColumnDef[] = [
          { name: "id", type: "string" },
          ...fieldNames.map((f) => ({ name: f, type: "string" })),
          { name: "ttl", type: "number" },
        ]

        const rows: Record<string, unknown>[] = pageEntries.map(([id, fields], i) => {
          const row: Record<string, unknown> = { id }
          for (let j = 0; j < fields.length; j += 2) {
            row[fields[j]!] = fields[j + 1]
          }
          row.ttl = i === 0 && offset === 0 ? ttlVal : null
          return row
        })

        return {
          columns,
          rows,
          totalCount,
          query: `XRANGE ${key} - + COUNT ${limit} (${totalCount} entries)`,
        }
      }

      default: {
        return {
          columns: [
            { name: "key", type: "string" },
            { name: "type", type: "string" },
            { name: "ttl", type: "number" },
          ],
          rows: offset === 0 ? [{ key, type: keyType, ttl: ttlVal }] : [],
          totalCount: 1,
          query: `TYPE ${key}`,
        }
      }
    }
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
      
      // Use rawQuery as pattern if provided, otherwise use collection name
      let pattern = opts.collection || "*"
      if (opts.rawQuery && opts.rawQuery.trim()) {
        const validated = validateRedisPattern(opts.rawQuery)
        if (!validated.valid) {
          throw new Error(`Pattern validation error: ${validated.error}`)
        }
        pattern = validated.pattern
      }
      
      const limit = opts.limit ?? 50
      const offset = opts.offset ?? 0

      // Single key — expand its contents based on type
      if (!hasRedisGlob(pattern)) {
        const exists = await redis.exists(pattern)
        if (exists > 0) {
          const result = await querySingleKey(pattern, limit, offset)
          const duration = Math.round(performance.now() - start)
          return { ...result, duration }
        }
        // Key doesn't exist
        return {
          columns: [{ name: "key", type: "string" }],
          rows: [],
          totalCount: 0,
          duration: Math.round(performance.now() - start),
          query: `GET ${pattern}`,
        }
      }

      // Glob pattern — list matching keys
      const { keys: allKeys } = await scanRedisKeys(redis, pattern)
      const pagedKeys = allKeys.slice(offset, offset + limit)

      const columns: ColumnDef[] = [
        { name: "key", type: "string" },
        { name: "type", type: "string" },
        { name: "ttl", type: "number" },
      ]

      const pipeline = redis.pipeline()
      for (const key of pagedKeys) {
        pipeline.type(key)
        pipeline.ttl(key)
      }
      const pipeResults = await pipeline.exec()

      const rows: Record<string, unknown>[] = pagedKeys.map((key, i) => ({
        key,
        type: pipeResults?.[i * 2]?.[1] ?? "unknown",
        ttl: pipeResults?.[i * 2 + 1]?.[1] === -1 ? null : pipeResults?.[i * 2 + 1]?.[1],
      }))

      const duration = Math.round(performance.now() - start)
      return { columns, rows, totalCount: allKeys.length, duration, query: `SCAN 0 MATCH ${pattern} COUNT 100` }
    },

    async updateField(opts: UpdateFieldOpts): Promise<UpdateFieldResult> {
      if (!redis) throw new Error("Not connected")
      await redis.select(parseInt(opts.database, 10))

      const key = opts.collection
      const keyType = await redis.type(key)

      if (opts.field === "ttl" || opts.field === "key" || opts.field === "type" || opts.field === "index") {
        throw new Error(`Editing field '${opts.field}' is not supported`)
      }

      if (keyType === "string") {
        if (opts.field !== "value") throw new Error("Only 'value' field can be edited for Redis strings")
        await redis.set(key, String(opts.value ?? ""))
        return { query: `SET ${key} <value>`, affected: 1 }
      }

      if (keyType === "hash") {
        if (opts.field !== "value") throw new Error("Only 'value' field can be edited for Redis hashes")
        const hashField = opts.row.field
        if (typeof hashField !== "string" || hashField.length === 0) {
          throw new Error("Missing hash field name in selected row")
        }
        await redis.hset(key, hashField, String(opts.value ?? ""))
        return { query: `HSET ${key} ${hashField} <value>`, affected: 1 }
      }

      if (keyType === "list") {
        if (opts.field !== "value") throw new Error("Only 'value' field can be edited for Redis lists")
        const index = Number(opts.row.index)
        if (Number.isNaN(index)) {
          throw new Error("Missing list index in selected row")
        }
        await redis.lset(key, index, String(opts.value ?? ""))
        return { query: `LSET ${key} ${index} <value>`, affected: 1 }
      }

      throw new Error(`Editing is not supported for Redis type '${keyType}'`)
    },
  }
}
