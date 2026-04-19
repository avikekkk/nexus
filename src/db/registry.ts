import type { DbType, DbDriver } from "./types.ts"
import { createElasticSearchDriver } from "./elasticsearch.ts"
import { createMongoDriver } from "./mongo.ts"
import { createMysqlDriver } from "./mysql.ts"
import { createRedisDriver } from "./redis.ts"
import { createPostgresDriver } from "./postgres.ts"

const factories: Record<DbType, () => DbDriver> = {
  elasticsearch: createElasticSearchDriver,
  mongo: createMongoDriver,
  mysql: createMysqlDriver,
  postgres: createPostgresDriver,
  redis: createRedisDriver,
}

export function createDriver(type: DbType): DbDriver {
  return factories[type]()
}
