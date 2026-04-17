export type CompletionKind = "database" | "collection" | "field" | "operation" | "snippet"

export interface CompletionSchema {
  databases: string[]
  collections: string[]
  collectionFields: Record<string, string[]>
}

export interface CompletionContext {
  query: string
  cursor: number
  dbType: "mongo" | "mysql" | "redis"
  database: string
  schema: CompletionSchema
}

export interface CompletionSuggestion {
  id: string
  label: string
  kind: CompletionKind
  insertText: string
  detail?: string
  cursorOffset?: number
}

export interface CompletionResult {
  items: CompletionSuggestion[]
  replaceStart: number
  replaceEnd: number
}

export interface CompletionProvider {
  getCompletions: (context: CompletionContext) => CompletionResult | null
}
