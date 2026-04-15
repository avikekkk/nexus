import { mongoCompletionProvider } from "./providers/mongo.ts"
import { mysqlCompletionProvider } from "./providers/mysql.ts"
import { redisCompletionProvider } from "./providers/redis.ts"
import type { CompletionContext, CompletionProvider, CompletionResult } from "./types.ts"

const providerByDbType: Record<CompletionContext["dbType"], CompletionProvider> = {
  mongo: mongoCompletionProvider,
  mysql: mysqlCompletionProvider,
  redis: redisCompletionProvider,
}

export function getCompletions(context: CompletionContext): CompletionResult | null {
  const provider = providerByDbType[context.dbType]
  return provider.getCompletions(context)
}
