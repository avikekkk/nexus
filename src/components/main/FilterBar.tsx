import { useState, useEffect, useCallback } from "react"
import { useKeyboard } from "@opentui/react"
import type { DbType } from "../../db/types.ts"
import { parseMongoFilter, parseMySQLQuery, validateRedisPattern } from "../../utils/queryParser.ts"
import { deleteWordBackward, getPrintableKey, isDeleteWordKey, isSubmitKey } from "../../utils/keyInput.ts"

interface FilterBarProps {
  focused: boolean
  dbType: DbType
  currentFilter: string
  currentSort: Record<string, 1 | -1> | null
  onSortChange: (sort: Record<string, 1 | -1> | null) => void
  onExecute: (filter: string) => void
  onClear: () => void
  onUnfocus: () => void
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
  currentFilter,
  currentSort,
  onExecute,
  onClear,
  onUnfocus,
}: FilterBarProps) {
  const [filterInput, setFilterInput] = useState(currentFilter)
  const [cursorPos, setCursorPos] = useState(currentFilter.length)
  const [validationError, setValidationError] = useState<string | null>(null)

  // Sync with external changes
  useEffect(() => {
    setFilterInput(currentFilter)
    setCursorPos(currentFilter.length)
  }, [currentFilter])

  // Validate input based on DB type
  const validate = useCallback((input: string): string | null => {
    if (!input || input.trim() === "") return null

    switch (dbType) {
      case "mongo": {
        const result = parseMongoFilter(input)
        return result.error
      }
      case "mysql": {
        const result = parseMySQLQuery(input)
        return result.error
      }
      case "redis": {
        const result = validateRedisPattern(input)
        return result.error
      }
    }
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
    onClear()
  }, [onClear])

  useKeyboard((key) => {
    if (!focused) return

    // Enter: execute query
    if (isSubmitKey(key)) {
      handleExecute()
      return
    }

    // Escape: unfocus
    if (key.name === "escape") {
      onUnfocus()
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
      return
    }

    if (key.name === "left") {
      setCursorPos((prev) => Math.max(0, prev - 1))
      return
    }

    if (key.name === "right") {
      setCursorPos((prev) => Math.min(filterInput.length, prev + 1))
      return
    }

    if (key.name === "home") {
      setCursorPos(0)
      return
    }

    if (key.name === "end") {
      setCursorPos(filterInput.length)
      return
    }

    // Handle text input
    if (key.name === "backspace") {
      const result = getInputAfterBackspace(filterInput, cursorPos)
      setFilterInput(result.value)
      setCursorPos(result.cursor)
    } else if (key.name === "delete") {
      const result = getInputAfterDelete(filterInput, cursorPos)
      setFilterInput(result.value)
      setCursorPos(result.cursor)
    } else {
      const printable = getPrintableKey(key)
      if (!printable) return
      const result = getCompletedInput(filterInput, cursorPos, printable)
      setFilterInput(result.value)
      setCursorPos(result.cursor)
    }
  })

  const sortIndicator = currentSort
    ? Object.entries(currentSort)
        .map(([col, dir]) => `${col} ${dir === 1 ? "▴" : "▾"}`)
        .join(", ")
    : ""

  return (
    <box height={2} flexDirection="column">
      {/* Filter input */}
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
            <text fg="#565f89">
              {focused ? <span fg="#7aa2f7">█</span> : "{}"}
            </text>
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

      {/* Separator below */}
      <box height={1} paddingX={0}>
        <text fg="#414868">{"─".repeat(200)}</text>
      </box>
    </box>
  )
}
