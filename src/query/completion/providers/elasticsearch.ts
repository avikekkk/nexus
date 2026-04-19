import { rankCompletionSuggestions } from "../ranking.ts"
import type { CompletionContext, CompletionProvider, CompletionSuggestion } from "../types.ts"

const ES_KEYWORDS: CompletionSuggestion[] = [
  "query",
  "match",
  "match_phrase",
  "term",
  "terms",
  "bool",
  "must",
  "should",
  "must_not",
  "filter",
  "range",
  "exists",
  "wildcard",
  "prefix",
  "fuzzy",
  "ids",
  "match_all",
  "multi_match",
  "sort",
  "from",
  "size",
  "_source",
  "aggs",
  "highlight",
  "post_filter",
].map((keyword) => ({
  id: `es-keyword-${keyword}`,
  label: keyword,
  kind: "operation" as const,
  insertText: keyword,
}))

const ES_SNIPPETS: CompletionSuggestion[] = [
  {
    id: "es-snippet-match",
    label: "match query",
    kind: "snippet",
    insertText: '{"match": {"${1:field}": "${2:value}"}}',
    detail: "Full text match query",
    cursorOffset: 0,
  },
  {
    id: "es-snippet-term",
    label: "term query",
    kind: "snippet",
    insertText: '{"term": {"${1:field}": "${2:value}"}}',
    detail: "Exact value query",
    cursorOffset: 0,
  },
  {
    id: "es-snippet-bool",
    label: "bool query",
    kind: "snippet",
    insertText: '{"bool": {"must": [${1}], "should": [${2}], "must_not": [${3}]}}',
    detail: "Boolean compound query",
    cursorOffset: 0,
  },
  {
    id: "es-snippet-range",
    label: "range query",
    kind: "snippet",
    insertText: '{"range": {"${1:field}": {"gte": ${2:0}, "lte": ${3:100}}}}',
    detail: "Range query (gte, gt, lte, lt)",
    cursorOffset: 0,
  },
  {
    id: "es-snippet-match-all",
    label: "match_all query",
    kind: "snippet",
    insertText: '{"match_all": {}}',
    detail: "Match all documents",
    cursorOffset: 0,
  },
  {
    id: "es-snippet-full-search",
    label: "full search body",
    kind: "snippet",
    insertText: '{"query": {"${1:match}": {"${2:field}": "${3:value}"}}, "size": ${4:50}, "from": ${5:0}}',
    detail: "Complete search request body",
    cursorOffset: 0,
  },
]

function getCurrentToken(query: string, cursor: number): { token: string; start: number; end: number } {
  let start = cursor
  let end = cursor

  while (start > 0 && /[\w_.]/.test(query[start - 1]!)) start--
  while (end < query.length && /[\w_.]/.test(query[end]!)) end++

  return {
    token: query.slice(start, end).toLowerCase(),
    start,
    end,
  }
}

export const elasticsearchCompletionProvider: CompletionProvider = {
  getCompletions(context: CompletionContext) {
    const { query, cursor, schema } = context
    const { token, start, end } = getCurrentToken(query, cursor)

    if (!token && cursor === 0) {
      // At the beginning, suggest the full search body snippet
      const items = rankCompletionSuggestions([...ES_SNIPPETS, ...ES_KEYWORDS], "")
      return { items, replaceStart: start, replaceEnd: end }
    }

    const items: CompletionSuggestion[] = []

    // Add keywords that match the current token
    for (const keyword of ES_KEYWORDS) {
      if (keyword.label.toLowerCase().startsWith(token)) {
        items.push(keyword)
      }
    }

    // Add snippets that match
    for (const snippet of ES_SNIPPETS) {
      if (snippet.label.toLowerCase().includes(token) || snippet.insertText.toLowerCase().includes(token)) {
        items.push(snippet)
      }
    }

    // Add collection names
    for (const collection of schema.collections) {
      if (collection.toLowerCase().startsWith(token)) {
        items.push({
          id: `es-collection-${collection}`,
          label: collection,
          kind: "collection",
          insertText: collection,
        })
      }
    }

    // Add field names
    for (const [collection, fields] of Object.entries(schema.collectionFields)) {
      for (const field of fields) {
        if (field.toLowerCase().startsWith(token)) {
          items.push({
            id: `es-field-${collection}-${field}`,
            label: field,
            kind: "field",
            insertText: field,
            detail: collection,
          })
        }
      }
    }

    if (items.length === 0) return null

    const ranked = rankCompletionSuggestions(items, token)
    return { items: ranked, replaceStart: start, replaceEnd: end }
  },
}
