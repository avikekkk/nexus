import { useState, useEffect, useCallback } from "react"
import { useKeyboard } from "@opentui/react"
import type { DbType } from "../../db/types.ts"
import { parseMongoFilter, parseMySQLQuery, validateRedisPattern } from "../../utils/queryParser.ts"

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
  const [validationError, setValidationError] = useState<string | null>(null)

  // Sync with external changes
  useEffect(() => {
    setFilterInput(currentFilter)
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
    setValidationError(null)
    onClear()
  }, [onClear])

  useKeyboard((key) => {
    if (!focused) return

    // Enter: execute query
    if (key.name === "return") {
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
    if ((key.name === "backspace" && key.ctrl) || (key.name === "w" && key.ctrl)) {
      setFilterInput((prev) => {
        const trimmed = prev.trimEnd()
        const lastSep = Math.max(trimmed.lastIndexOf(" "), trimmed.lastIndexOf(":"), trimmed.lastIndexOf("/"))
        return lastSep >= 0 ? prev.slice(0, lastSep + 1) : ""
      })
      return
    }

    // Handle text input
    if (key.name === "backspace") {
      setFilterInput((prev) => prev.slice(0, -1))
    } else if (key.name === "delete") {
      setFilterInput("")
    } else if (key.sequence && key.sequence.length === 1 && !key.ctrl) {
      setFilterInput((prev) => prev + key.sequence)
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
            <text fg={focused ? "#c0caf5" : "#a9b1d6"}>
              {filterInput}
              {focused && <span fg="#7aa2f7">█</span>}
            </text>
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
