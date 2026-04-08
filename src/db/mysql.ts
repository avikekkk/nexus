import mysql from "mysql2/promise"
import type { DbDriver, ColumnDef } from "./types.ts"

export function createMysqlDriver(): DbDriver {
  let connection: mysql.Connection | null = null
  let connected = false

  return {
    type: "mysql",

    async connect(config) {
      connection = await mysql.createConnection({
        host: config.host,
        port: config.port,
        user: config.username,
        password: config.password,
        database: config.database,
        ssl: config.tls ? {} : undefined,
      })
      connected = true
    },

    async disconnect() {
      if (connection) {
        await connection.end()
        connection = null
      }
      connected = false
    },

    isConnected() {
      return connected
    },

    async listDatabases() {
      if (!connection) throw new Error("Not connected")
      const [rows] = await connection.query("SHOW DATABASES")
      return (rows as Array<{ Database: string }>).map((r) => r.Database)
    },

    async listCollections(db) {
      if (!connection) throw new Error("Not connected")
      const [rows] = await connection.query(`SHOW TABLE STATUS FROM \`${db}\``)
      return (rows as Array<{ Name: string; Rows: number }>).map((r) => ({
        name: r.Name,
        type: "table" as const,
        count: r.Rows ?? undefined,
      }))
    },

    async query(opts) {
      if (!connection) throw new Error("Not connected")

      const start = performance.now()

      if (opts.rawQuery) {
        await connection.query(`USE \`${opts.database}\``)
        const [rows, fields] = await connection.query(opts.rawQuery)
        const duration = Math.round(performance.now() - start)

        const resultRows = Array.isArray(rows) ? (rows as Record<string, unknown>[]) : []
        const columns: ColumnDef[] = Array.isArray(fields)
          ? fields.map((f: any) => ({ name: f.name, type: String(f.type ?? "unknown") }))
          : []

        return {
          columns,
          rows: resultRows,
          totalCount: resultRows.length,
          duration,
          query: opts.rawQuery,
        }
      }

      const limit = opts.limit ?? 50
      const offset = opts.offset ?? 0
      const table = `\`${opts.database}\`.\`${opts.collection}\``

      let whereClause = ""
      const whereValues: unknown[] = []
      if (opts.filter && Object.keys(opts.filter).length > 0) {
        const conditions = Object.entries(opts.filter).map(([key, value]) => {
          whereValues.push(value)
          return `\`${key}\` = ?`
        })
        whereClause = ` WHERE ${conditions.join(" AND ")}`
      }

      let orderClause = ""
      if (opts.sort && Object.keys(opts.sort).length > 0) {
        const parts = Object.entries(opts.sort).map(([key, dir]) => `\`${key}\` ${dir === 1 ? "ASC" : "DESC"}`)
        orderClause = ` ORDER BY ${parts.join(", ")}`
      }

      const dataQuery = `SELECT * FROM ${table}${whereClause}${orderClause} LIMIT ${limit} OFFSET ${offset}`
      const countQuery = `SELECT COUNT(*) as cnt FROM ${table}${whereClause}`

      const [rows, fields] = await connection.query(dataQuery, whereValues)
      const [countRows] = await connection.query(countQuery, whereValues)

      const duration = Math.round(performance.now() - start)
      const resultRows = Array.isArray(rows) ? (rows as Record<string, unknown>[]) : []
      const columns: ColumnDef[] = Array.isArray(fields)
        ? fields.map((f: any) => ({ name: f.name, type: String(f.type ?? "unknown"), nullable: f.flags ? !(f.flags & 1) : undefined }))
        : []

      const totalCount = (countRows as Array<{ cnt: number }>)[0]?.cnt ?? resultRows.length

      return { columns, rows: resultRows, totalCount, duration, query: dataQuery }
    },
  }
}
