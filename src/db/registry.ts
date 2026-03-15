import type { DbType, DbDriver } from "./types.ts"
import { createMongoDriver } from "./mongo.ts"
import { createMysqlDriver } from "./mysql.ts"
import { createRedisDriver } from "./redis.ts"

const factories: Record<DbType, () => DbDriver> = {
  mongo: createMongoDriver,
  mysql: createMysqlDriver,
  redis: createRedisDriver,
}

export function createDriver(type: DbType): DbDriver {
  return factories[type]()
}
