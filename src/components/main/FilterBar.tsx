import { useState, useEffect, useCallback } from "react"
import { useKeyboard } from "@opentui/react"
import type { DbType } from "../../db/types.ts"
import { parseElasticSearchFilter, parseMongoFilter, parseMySQLQuery, validateRedisPattern } from "../../utils/queryParser.ts"
import {
  deleteWordBackward,
  getTextInput,
  isDeleteWordKey,
  isSubmitKey,
  moveCursorWordLeft,
  moveCursorWordRight,
  normalizeTextInput,
} from "../../utils/keyInput.ts"
import { subscribePaste } from "../../state/paste.ts"
import { CompletionMenu } from "../common/CompletionMenu.tsx"
import { getCompletions } from "../../query/completion/engine.ts"
import type { CompletionSuggestion } from "../../query/completion/types.ts"

interface FilterBarProps {
  focused: boolean
  dbType: DbType
  database: string
  collection: string
  schemaDatabases: string[]
  schemaCollections: string[]
  schemaCollectionFields: Record<string, string[]>
  currentFilter: string
  currentSort: Record<string, 1 | -1> | null
  onSortChange: (sort: Record<string, 1 | -1> | null) => void
  onExecute: (filter: string) => void
  onClear: () => void
  onUnfocus: () => void
}

interface ActiveCompletion {
  items: CompletionSuggestion[]
  replaceStart: number
  replaceEnd: number
}

const AUTO_PAIR_MAP: Record<string, string> = {
  "{": "}",
  "[": "]",
  "(": ")",
  '"': '"',
  "'": "'",
}

interface InputEditResult {
  value: string
  cursor: number
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

interface CompletionRewrite {
  query: string
  cursor: number
  replaceOffset: number
}

function buildFilterCompletionQuery(dbType: DbType, collection: string, input: string, cursor: number): CompletionRewrite {
  if (dbType === "mongo") {
    const prefix = `db.${collection}.find(`
    const wrapInObject = !input.trimStart().startsWith("{")
    const replaceOffset = prefix.length + (wrapInObject ? 1 : 0)
    return {
      query: wrapInObject ? `${prefix}{${input}` : `${prefix}${input}`,
      cursor: replaceOffset + cursor,
      replaceOffset,
    }
  }

  if (dbType === "mysql" || dbType === "postgres") {
    const trimmed = input.trimStart()
    const hasExplicitSql = /^(select|with|show|describe|desc|explain)\b/i.test(trimmed)

    if (!collection || hasExplicitSql) {
      return { query: input, cursor, replaceOffset: 0 }
    }

    const prefix = `SELECT * FROM ${collection} WHERE `
    return {
      query: `${prefix}${input}`,
      cursor: prefix.length + cursor,
      replaceOffset: prefix.length,
    }
  }

  return { query: input, cursor, replaceOffset: 0 }
}

function getInputAfterBackspace(input: string, cursor: number): InputEditResult {
  if (!input || cursor <= 0) {
    return { value: input, cursor }
  }

  const before = input.slice(0, cursor)
  const after = input.slice(cursor)
  const prevChar = before.at(-1) ?? ""
  const nextChar = after.at(0) ?? ""

  if (AUTO_PAIR_MAP[prevChar] === nextChar) {
    return {
      value: input.slice(0, cursor - 1) + input.slice(cursor + 1),
      cursor: cursor - 1,
    }
  }

  return {
    value: input.slice(0, cursor - 1) + after,
    cursor: cursor - 1,
  }
}

function getInputAfterDelete(input: string, cursor: number): InputEditResult {
  if (cursor >= input.length) {
    return { value: input, cursor }
  }

  const currentChar = input[cursor] ?? ""
  const nextChar = input[cursor + 1] ?? ""

  if (AUTO_PAIR_MAP[currentChar] === nextChar) {
    return {
      value: input.slice(0, cursor) + input.slice(cursor + 2),
      cursor,
    }
  }

  return {
    value: input.slice(0, cursor) + input.slice(cursor + 1),
    cursor,
  }
}

function getCompletedInput(input: string, cursor: number, char: string): InputEditResult {
  const before = input.slice(0, cursor)
  const after = input.slice(cursor)
  const prevChar = before.at(-1) ?? ""
  const nextChar = after.at(0) ?? ""

  if (char === ",") {
    if (before.endsWith(",") || before.endsWith(", ")) return { value: input, cursor }
    return {
      value: `${before}, ${after}`,
      cursor: cursor + 2,
    }
  }

  if (char === ":") {
    if (before.endsWith(":")) return { value: input, cursor }
    if (before.endsWith(": ")) return { value: input, cursor }
    return {
      value: `${before}: ${after}`,
      cursor: cursor + 2,
    }
  }

  if (char === '"' || char === "'") {
    if (before.endsWith("\\")) {
      return {
        value: `${before}${char}${after}`,
        cursor: cursor + 1,
      }
    }

    if (nextChar === char) {
      return {
        value: input,
        cursor: cursor + 1,
      }
    }

    const prevIsWord = /[a-zA-Z0-9_]/.test(prevChar)
    const nextIsWord = /[a-zA-Z0-9_]/.test(nextChar)
    const nextAllowsPair = !nextChar || /[\s,.:;)}\]]/.test(nextChar)

    if (prevIsWord || nextIsWord || !nextAllowsPair) {
      return {
        value: `${before}${char}${after}`,
        cursor: cursor + 1,
      }
    }

    return {
      value: `${before}${char}${char}${after}`,
      cursor: cursor + 1,
    }
  }

  const pair = AUTO_PAIR_MAP[char]
  if (pair) {
    return {
      value: `${before}${char}${pair}${after}`,
      cursor: cursor + 1,
    }
  }

  if ((char === "}" || char === "]" || char === ")") && after.startsWith(char)) {
    return {
      value: input,
      cursor: cursor + 1,
    }
  }

  return {
    value: `${before}${char}${after}`,
    cursor: cursor + 1,
  }
}

export function FilterBar({
  focused,
  dbType,
  database,
  collection,
  schemaDatabases,
  schemaCollections,
  schemaCollectionFields,
  currentFilter,
  currentSort,
  onExecute,
  onClear,
  onUnfocus,
}: FilterBarProps) {
  const [filterInput, setFilterInput] = useState("")
  const [cursorPos, setCursorPos] = useState(0)
  const [validationError, setValidationError] = useState<string | null>(null)
  const [completion, setCompletion] = useState<ActiveCompletion | null>(null)
  const [completionIndex, setCompletionIndex] = useState(0)

  const closeCompletion = useCallback(() => {
    setCompletion(null)
    setCompletionIndex(0)
  }, [])

  const refreshCompletion = useCallback(
    (nextInput: string, nextCursor: number, preserveSelection = true) => {
      if (!focused) {
        closeCompletion()
        return
      }

      const rewritten = buildFilterCompletionQuery(dbType, collection, nextInput, nextCursor)
      const result = getCompletions({
        query: rewritten.query,
        cursor: rewritten.cursor,
        dbType,
        database,
        schema: {
          databases: schemaDatabases,
          collections: schemaCollections,
          collectionFields: schemaCollectionFields,
        },
      })

      if (!result || result.items.length === 0) {
        closeCompletion()
        return
      }

      const replaceStart = result.replaceStart - rewritten.replaceOffset
      const replaceEnd = result.replaceEnd - rewritten.replaceOffset

      if (replaceStart < 0 || replaceEnd < replaceStart || replaceEnd > nextInput.length) {
        closeCompletion()
        return
      }

      setCompletion({
        items: result.items,
        replaceStart,
        replaceEnd,
      })

      if (preserveSelection) {
        setCompletionIndex((prev) => Math.min(prev, result.items.length - 1))
      } else {
        setCompletionIndex(0)
      }
    },
    [focused, dbType, collection, database, schemaDatabases, schemaCollections, schemaCollectionFields, closeCompletion]
  )

  const applyCompletion = useCallback(
    (item: CompletionSuggestion) => {
      if (!completion) return

      const next = `${filterInput.slice(0, completion.replaceStart)}${item.insertText}${filterInput.slice(completion.replaceEnd)}`
      const nextCursor = completion.replaceStart + (item.cursorOffset ?? item.insertText.length)
      setFilterInput(next)
      setCursorPos(clamp(nextCursor, 0, next.length))
      closeCompletion()
    },
    [completion, filterInput, closeCompletion]
  )

  // Sync with external changes
  useEffect(() => {
    setFilterInput(currentFilter)
    setCursorPos(currentFilter.length)
  }, [currentFilter])

  useEffect(() => {
    if (!focused) {
      closeCompletion()
      return
    }

    const nextCursor = clamp(cursorPos, 0, filterInput.length)
    if (nextCursor !== cursorPos) {
      setCursorPos(nextCursor)
    }
    refreshCompletion(filterInput, nextCursor)
  }, [focused, filterInput, cursorPos, refreshCompletion, closeCompletion])

  // Validate input based on DB type
  const validate = useCallback((input: string): string | null => {
    if (!input || input.trim() === "") return null

    switch (dbType) {
      case "mongo": {
        const result = parseMongoFilter(input)
        return result.error
      }
      case "mysql":
      case "postgres": {
        const result = parseMySQLQuery(input)
        return result.error
      }
      case "redis": {
        const result = validateRedisPattern(input)
        return result.error
      }
      case "elasticsearch": {
        const result = parseElasticSearchFilter(input)
        return result.error
      }
    }
    return null
  }, [dbType])

  // Validate on input change (debounced effect)
  useEffect(() => {
    const timer = setTimeout(() => {
      const error = validate(filterInput)
      setValidationError(error)
    }, 300)
    return () => clearTimeout(timer)
  }, [filterInput, validate])

  const handleExecute = useCallback(() => {
    const error = validate(filterInput)
    if (error) {
      setValidationError(error)
      return
    }

    onExecute(filterInput)
  }, [filterInput, validate, onExecute])

  const handleClear = useCallback(() => {
    setFilterInput("")
    setCursorPos(0)
    setValidationError(null)
    closeCompletion()
    onClear()
  }, [onClear, closeCompletion])

  useKeyboard((key) => {
    if (!focused) return

    const hasCompletion = completion && completion.items.length > 0

    if (hasCompletion && (key.name === "down" || key.name === "j")) {
      setCompletionIndex((prev) => Math.min((completion?.items.length ?? 1) - 1, prev + 1))
      return
    }

    if (hasCompletion && (key.name === "up" || key.name === "k")) {
      setCompletionIndex((prev) => Math.max(0, prev - 1))
      return
    }

    if (key.name === "tab") {
      if (hasCompletion) {
        const selected = completion?.items[completionIndex]
        if (selected) {
          applyCompletion(selected)
        }
      }
      return
    }

    // Enter: execute query
    if (isSubmitKey(key)) {
      handleExecute()
      return
    }

    // Escape: close completion or unfocus
    if (key.name === "escape") {
      if (hasCompletion) {
        closeCompletion()
      } else {
        onUnfocus()
      }
      return
    }

    // Ctrl+L: clear
    if (key.ctrl && key.name === "l") {
      handleClear()
      return
    }

    // Delete word: ctrl+backspace or ctrl+w
    if (isDeleteWordKey(key)) {
      const result = deleteWordBackward(filterInput, cursorPos)
      setFilterInput(result.value)
      setCursorPos(result.cursor)
      refreshCompletion(result.value, result.cursor)
      return
    }

    if (key.name === "left") {
      const nextCursor = key.ctrl ? moveCursorWordLeft(filterInput, cursorPos) : Math.max(0, cursorPos - 1)
      setCursorPos(nextCursor)
      refreshCompletion(filterInput, nextCursor)
      return
    }

    if (key.name === "right") {
      const nextCursor = key.ctrl ? moveCursorWordRight(filterInput, cursorPos) : Math.min(filterInput.length, cursorPos + 1)
      setCursorPos(nextCursor)
      refreshCompletion(filterInput, nextCursor)
      return
    }

    if (key.name === "home") {
      setCursorPos(0)
      refreshCompletion(filterInput, 0)
      return
    }

    if (key.name === "end") {
      const nextCursor = filterInput.length
      setCursorPos(nextCursor)
      refreshCompletion(filterInput, nextCursor)
      return
    }

    // Handle text input
    if (key.name === "backspace") {
      const result = getInputAfterBackspace(filterInput, cursorPos)
      setFilterInput(result.value)
      setCursorPos(result.cursor)
      refreshCompletion(result.value, result.cursor)
      return
    }

    if (key.name === "delete") {
      const result = getInputAfterDelete(filterInput, cursorPos)
      setFilterInput(result.value)
      setCursorPos(result.cursor)
      refreshCompletion(result.value, result.cursor)
      return
    }

    const inputText = getTextInput(key)
    if (!inputText) return

    if (inputText.length > 1) {
      const before = filterInput.slice(0, cursorPos)
      const after = filterInput.slice(cursorPos)
      const next = `${before}${inputText}${after}`
      const nextCursor = cursorPos + inputText.length
      setFilterInput(next)
      setCursorPos(nextCursor)
      refreshCompletion(next, nextCursor)
      return
    }

    const result = getCompletedInput(filterInput, cursorPos, inputText)
    setFilterInput(result.value)
    setCursorPos(result.cursor)
    refreshCompletion(result.value, result.cursor)
  })

  const sortIndicator = currentSort
    ? Object.entries(currentSort)
        .map(([col, dir]) => `${col} ${dir === 1 ? "▴" : "▾"}`)
        .join(", ")
    : ""

  const applyPastedText = useCallback(
    (rawText: string) => {
      if (!focused) return

      const pasted = normalizeTextInput(rawText)
      if (!pasted) return

      const before = filterInput.slice(0, cursorPos)
      const after = filterInput.slice(cursorPos)
      const next = `${before}${pasted}${after}`
      const nextCursor = cursorPos + pasted.length
      setFilterInput(next)
      setCursorPos(nextCursor)
      refreshCompletion(next, nextCursor)
    },
    [focused, filterInput, cursorPos, refreshCompletion]
  )

  useEffect(() => subscribePaste(applyPastedText), [applyPastedText])

  const handlePaste = useCallback(
    (event: { text: string; preventDefault?: () => void; stopPropagation?: () => void }) => {
      applyPastedText(event.text)
      event.preventDefault?.()
      event.stopPropagation?.()
    },
    [applyPastedText]
  )

  const completionLeft = Math.max(0, "Query: ".length + cursorPos)

  return (
    <box flexDirection="column" onPaste={handlePaste}>
      <box height={1} flexDirection="row" paddingX={1}>
        <text fg="#565f89">{"Query: "}</text>
        <box flexGrow={1} flexDirection="row">
          {filterInput ? (
            focused ? (
              <text fg="#c0caf5">
                {filterInput.slice(0, cursorPos)}
                {cursorPos < filterInput.length ? (
                  <span fg="#1a1b26" bg="#7aa2f7">
                    {filterInput[cursorPos]}
                  </span>
                ) : (
                  <span fg="#7aa2f7">█</span>
                )}
                {filterInput.slice(cursorPos + (cursorPos < filterInput.length ? 1 : 0))}
              </text>
            ) : (
              <text fg="#a9b1d6">{filterInput}</text>
            )
          ) : (
            <text fg="#565f89">{focused ? <span fg="#7aa2f7">█</span> : "{}"}</text>
          )}
        </box>

        {sortIndicator && (
          <box paddingLeft={1}>
            <text fg="#565f89">{sortIndicator}</text>
          </box>
        )}

        {validationError && (
          <box paddingLeft={1}>
            <text fg="#f7768e">{"✗"}</text>
          </box>
        )}

        {focused && (
          <box paddingLeft={1}>
            <text fg="#565f89">{"⏎"}</text>
          </box>
        )}
      </box>

      {focused && completion && completion.items.length > 0 && (
        <box height={1} paddingX={1} flexDirection="row">
          {completionLeft > 0 && <box width={completionLeft} />}
          <CompletionMenu visible={true} items={completion.items} selectedIndex={completionIndex} />
        </box>
      )}

      <box height={1} paddingX={0}>
        <text fg="#414868">{"─".repeat(200)}</text>
      </box>
    </box>
  )
}
