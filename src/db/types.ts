export type DbType = "mongo" | "mysql" | "redis"

export interface ConnectionConfig {
  id: string
  name: string
  type: DbType
  host: string
  port: number
  username?: string
  password?: string
  database?: string
  tls?: boolean
  url?: string
  visibleDatabases?: string[]
}

export interface CollectionInfo {
  name: string
  type: "collection" | "table" | "key" | "keyspace"
  count?: number
}

export interface CollectionPage {
  items: CollectionInfo[]
  nextCursor: string | null
}

export interface ColumnDef {
  name: string
  type: string
  nullable?: boolean
}

export interface QueryOpts {
  database: string
  collection: string
  filter?: Record<string, unknown>
  sort?: Record<string, 1 | -1>
  limit?: number
  offset?: number
  rawQuery?: string
}

export interface QueryResult {
  columns: ColumnDef[]
  rows: Record<string, unknown>[]
  totalCount: number
  duration: number
  query: string
}

export interface DbDriver {
  type: DbType
  connect(config: ConnectionConfig): Promise<void>
  disconnect(): Promise<void>
  isConnected(): boolean
  listDatabases(): Promise<string[]>
  listCollections(db: string): Promise<CollectionInfo[]>
  listCollectionsPage?(db: string, cursor?: string | null, limit?: number): Promise<CollectionPage>
  query(opts: QueryOpts): Promise<QueryResult>
}

export type ConnectionStatus = "disconnected" | "connecting" | "connected" | "error"

export interface ConnectionState {
  config: ConnectionConfig
  status: ConnectionStatus
  error?: string
  driver?: DbDriver
}

export const DEFAULT_PORTS: Record<DbType, number> = {
  mongo: 27017,
  mysql: 3306,
  redis: 6379,
}
