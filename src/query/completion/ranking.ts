import { fuzzyScore } from "../../utils/fuzzy.ts"
import type { CompletionKind, CompletionSuggestion } from "./types.ts"

const KIND_PRIORITY: Record<CompletionKind, number> = {
  field: 0,
  collection: 1,
  database: 2,
  snippet: 3,
  operation: 4,
}

interface RankedEntry {
  item: CompletionSuggestion
  score: number
  exact: boolean
  prefix: boolean
  contains: boolean
  kindPriority: number
  length: number
  index: number
}

export function rankCompletionSuggestions(items: CompletionSuggestion[], token: string): CompletionSuggestion[] {
  const normalizedToken = token.trim().toLowerCase()

  const ranked: RankedEntry[] = items
    .map((item, index) => {
      const label = item.label.toLowerCase()
      const score = normalizedToken ? fuzzyScore(normalizedToken, label) : 1
      if (score <= 0) {
        return null
      }

      return {
        item,
        score,
        exact: normalizedToken.length > 0 && label === normalizedToken,
        prefix: normalizedToken.length > 0 && label.startsWith(normalizedToken),
        contains: normalizedToken.length > 0 && label.includes(normalizedToken),
        kindPriority: KIND_PRIORITY[item.kind],
        length: item.label.length,
        index,
      }
    })
    .filter((entry): entry is RankedEntry => entry !== null)

  ranked.sort((a, b) => {
    if (a.exact !== b.exact) return a.exact ? -1 : 1
    if (a.prefix !== b.prefix) return a.prefix ? -1 : 1
    if (a.score !== b.score) return b.score - a.score
    if (a.contains !== b.contains) return a.contains ? -1 : 1
    if (a.kindPriority !== b.kindPriority) return a.kindPriority - b.kindPriority
    if (a.length !== b.length) return a.length - b.length

    const labelCmp = a.item.label.localeCompare(b.item.label)
    if (labelCmp !== 0) return labelCmp

    return a.index - b.index
  })

  return ranked.map((entry) => entry.item)
}
