import { fuzzyScore } from "../../../utils/fuzzy.ts"
import type { CompletionContext, CompletionProvider, CompletionSuggestion } from "../types.ts"

const REDIS_PATTERN_SNIPPETS: CompletionSuggestion[] = [
  {
    id: "redis-pattern-all",
    label: "*",
    kind: "snippet",
    insertText: "*",
    detail: "Match all keys",
  },
  {
    id: "redis-pattern-prefix",
    label: "prefix:*",
    kind: "snippet",
    insertText: "prefix:*",
    cursorOffset: "prefix:".length,
    detail: "Match keys by prefix",
  },
]

function getTokenBounds(query: string, cursor: number): { start: number; end: number; token: string } {
  let start = cursor
  while (start > 0 && !/\s/.test(query[start - 1] ?? "")) {
    start -= 1
  }

  let end = cursor
  while (end < query.length && !/\s/.test(query[end] ?? "")) {
    end += 1
  }

  return {
    start,
    end,
    token: query.slice(start, end),
  }
}

function rankSuggestions(items: CompletionSuggestion[], query: string): CompletionSuggestion[] {
  const scored = items
    .map((item) => ({ item, score: fuzzyScore(query, item.label) }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score)

  return scored.map((entry) => entry.item)
}

export const redisCompletionProvider: CompletionProvider = {
  getCompletions(context: CompletionContext) {
    const bounds = getTokenBounds(context.query, context.cursor)

    const keySuggestions: CompletionSuggestion[] = context.schema.collections.map((name) => ({
      id: `redis-key-${name}`,
      label: name,
      kind: "collection",
      insertText: name,
      detail: `Key in DB ${context.database}`,
    }))

    const base = [...REDIS_PATTERN_SNIPPETS, ...keySuggestions]
    const items = rankSuggestions(base, bounds.token)
    if (items.length === 0) return null

    return {
      items,
      replaceStart: bounds.start,
      replaceEnd: bounds.end,
    }
  },
}
