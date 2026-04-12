import { MongoClient, ObjectId, type Db } from "mongodb"
import type {
  ConnectionConfig,
  DbDriver,
  CollectionInfo,
  ColumnDef,
  CollectionPage,
  UpdateFieldOpts,
  UpdateFieldResult,
} from "./types.ts"
import { parseMongoFilter } from "../utils/queryParser.ts"

export function createMongoDriver(): DbDriver {
  let client: MongoClient | null = null
  let connected = false

  function buildUri(config: ConnectionConfig): string {
    if (config.url) {
      return config.url
    }
    const auth = config.username
      ? `${encodeURIComponent(config.username)}:${encodeURIComponent(config.password ?? "")}@`
      : ""
    const tls = config.tls ? "?tls=true" : ""
    return `mongodb://${auth}${config.host}:${config.port}${tls}`
  }

  function getDb(name: string): Db {
    if (!client) throw new Error("Not connected")
    return client.db(name)
  }

  function getMongoRowId(row: Record<string, unknown>): unknown {
    if (!("_id" in row)) {
      throw new Error("MongoDB edit requires _id field in selected row")
    }
    const id = row._id
    if (typeof id === "string" && ObjectId.isValid(id)) {
      return new ObjectId(id)
    }
    return id
  }

  return {
    type: "mongo",

    async connect(config) {
      const uri = buildUri(config)
      client = new MongoClient(uri)
      await client.connect()
      connected = true
    },

    async disconnect() {
      if (client) {
        await client.close()
        client = null
      }
      connected = false
    },

    isConnected() {
      return connected
    },

    async listDatabases() {
      if (!client) throw new Error("Not connected")
      const result = await client.db("admin").admin().listDatabases()
      return result.databases.map((d) => d.name)
    },

    async listCollections(db) {
      const database = getDb(db)
      const collections = await database.listCollections().toArray()
      const infos: CollectionInfo[] = []

      for (const col of collections) {
        let count: number | undefined
        try {
          count = await database.collection(col.name).estimatedDocumentCount()
        } catch {
          // count unavailable
        }
        infos.push({ name: col.name, type: "collection", count })
      }

      return infos
    },

    async searchCollectionsPage(db, query, cursor = null, limit = 200): Promise<CollectionPage> {
      const database = getDb(db)
      const offset = Math.max(0, Number.parseInt(cursor ?? "0", 10) || 0)
      const normalizedQuery = query.trim().toLowerCase()

      const collections = await database.listCollections().toArray()
      const filtered = normalizedQuery
        ? collections.filter((c) => c.name.toLowerCase().includes(normalizedQuery))
        : collections

      const pageCollections = filtered.slice(offset, offset + limit)
      const items: CollectionInfo[] = pageCollections.map((c) => ({ name: c.name, type: "collection" }))
      const nextOffset = offset + items.length

      return {
        items,
        nextCursor: nextOffset < filtered.length ? String(nextOffset) : null,
        totalCount: filtered.length,
      }
    },

    async query(opts) {
      const database = getDb(opts.database)
      const collection = database.collection<Record<string, unknown>>(opts.collection)
      
      // Handle rawQuery as JSON filter string
      let filter = opts.filter ?? {}
      if (opts.rawQuery && opts.rawQuery.trim()) {
        const parsed = parseMongoFilter(opts.rawQuery)
        if (parsed.error) {
          throw new Error(`Filter parse error: ${parsed.error}`)
        }
        filter = parsed.filter ?? {}
      }
      
      const sort = opts.sort ?? {}
      const limit = opts.limit ?? 50
      const offset = opts.offset ?? 0

      const start = performance.now()

      const cursor = collection.find(filter).sort(sort).skip(offset).limit(limit)
      const rows = (await cursor.toArray()) as Record<string, unknown>[]
      const totalCount = await collection.countDocuments(filter)

      const duration = Math.round(performance.now() - start)

      const columns: ColumnDef[] = []
      if (rows.length > 0) {
        const first = rows[0]!
        for (const key of Object.keys(first)) {
          const val = first[key]
          columns.push({ name: key, type: val === null ? "null" : typeof val })
        }
      }

      const filterStr = Object.keys(filter).length > 0 ? JSON.stringify(filter) : "{}"
      const sortStr = Object.keys(sort).length > 0 ? `.sort(${JSON.stringify(sort)})` : ""
      const queryStr = `db.${opts.collection}.find(${filterStr})${sortStr}.skip(${offset}).limit(${limit})`

      return { columns, rows, totalCount, duration, query: queryStr }
    },

    async updateField(opts: UpdateFieldOpts): Promise<UpdateFieldResult> {
      const database = getDb(opts.database)
      const collection = database.collection(opts.collection)
      const rowId = getMongoRowId(opts.row)

      const result = await collection.updateOne({ _id: rowId as any }, { $set: { [opts.field]: opts.value } })
      const query = `db.${opts.collection}.updateOne({_id:${JSON.stringify(rowId)}}, {$set:{${opts.field}:...}})`

      return { query, affected: result.modifiedCount }
    },
  }
}
