import type { DbType, DbDriver } from "./types.ts"
import { createMongoDriver } from "./mongo.ts"
import { createMysqlDriver } from "./mysql.ts"
import { createRedisDriver } from "./redis.ts"
import { createPostgresDriver } from "./postgres.ts"

const factories: Record<DbType, () => DbDriver> = {
  mongo: createMongoDriver,
  mysql: createMysqlDriver,
  postgres: createPostgresDriver,
  redis: createRedisDriver,
}

export function createDriver(type: DbType): DbDriver {
  return factories[type]()
}
