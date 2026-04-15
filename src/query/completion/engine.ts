import { mongoCompletionProvider } from "./providers/mongo.ts"
import type { CompletionContext, CompletionProvider, CompletionResult } from "./types.ts"

const providerByDbType: Record<CompletionContext["dbType"], CompletionProvider> = {
  mongo: mongoCompletionProvider,
  mysql: {
    getCompletions: () => null,
  },
  redis: {
    getCompletions: () => null,
  },
}

export function getCompletions(context: CompletionContext): CompletionResult | null {
  const provider = providerByDbType[context.dbType]
  return provider.getCompletions(context)
}
