import { MongoClient, type Db } from "mongodb"
import type { ConnectionConfig, DbDriver, CollectionInfo, ColumnDef } from "./types.ts"

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

    async query(opts) {
      const database = getDb(opts.database)
      const collection = database.collection(opts.collection)
      const filter = opts.filter ?? {}
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
  }
}
