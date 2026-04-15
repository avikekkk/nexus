import { useCallback, useEffect, useMemo, useState } from "react"
import { useKeyboard } from "@opentui/react"
import { deleteWordBackward, getPrintableKey, isDeleteWordKey, isInsertNewlineKey, isSubmitKey } from "../../utils/keyInput.ts"
import { CompletionMenu } from "../common/CompletionMenu.tsx"
import { getCompletions } from "../../query/completion/engine.ts"
import { deleteWithAutoPair, insertWithAutoPair } from "../../query/editor/autoPair.ts"
import type { CompletionSuggestion } from "../../query/completion/types.ts"
import type { DbType } from "../../db/types.ts"

interface QueryConsoleProps {
  focused: boolean
  query: string
  error?: string | null
  dbType: DbType
  database: string
  schemaDatabases: string[]
  schemaCollections: string[]
  onChange: (query: string) => void
  onExecute: (query: string) => void
  onBlur: () => void
}

interface ActiveCompletion {
  items: CompletionSuggestion[]
  replaceStart: number
  replaceEnd: number
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

export function QueryConsole({
  focused,
  query,
  error,
  dbType,
  database,
  schemaDatabases,
  schemaCollections,
  onChange,
  onExecute,
  onBlur,
}: QueryConsoleProps) {
  const [cursorPos, setCursorPos] = useState(query.length)
  const [completion, setCompletion] = useState<ActiveCompletion | null>(null)
  const [completionIndex, setCompletionIndex] = useState(0)

  useEffect(() => {
    setCursorPos((prev) => clamp(prev, 0, query.length))
  }, [query])

  const lines = useMemo(() => query.split("\n"), [query])
  const beforeCursor = query.slice(0, cursorPos)
  const cursorLine = beforeCursor.split("\n").length - 1
  const cursorColumn = beforeCursor.length - (beforeCursor.lastIndexOf("\n") + 1)

  const closeCompletion = useCallback(() => {
    setCompletion(null)
    setCompletionIndex(0)
  }, [])

  const updateQuery = useCallback(
    (next: string, nextCursor: number) => {
      onChange(next)
      setCursorPos(clamp(nextCursor, 0, next.length))
    },
    [onChange]
  )

  const refreshCompletion = useCallback(
    (nextQuery: string, nextCursor: number, preserveSelection = true) => {
      const result = getCompletions({
        query: nextQuery,
        cursor: nextCursor,
        dbType,
        database,
        schema: {
          databases: schemaDatabases,
          collections: schemaCollections,
        },
      })

      if (!result || result.items.length === 0) {
        closeCompletion()
        return
      }

      setCompletion(result)
      if (preserveSelection) {
        setCompletionIndex((prev) => Math.min(prev, result.items.length - 1))
      } else {
        setCompletionIndex(0)
      }
    },
    [dbType, database, schemaDatabases, schemaCollections, closeCompletion]
  )

  const applyCompletion = useCallback(
    (item: CompletionSuggestion) => {
      if (!completion) return
      const next = `${query.slice(0, completion.replaceStart)}${item.insertText}${query.slice(completion.replaceEnd)}`
      const nextCursor = completion.replaceStart + (item.cursorOffset ?? item.insertText.length)
      updateQuery(next, nextCursor)
      closeCompletion()
    },
    [completion, query, updateQuery, closeCompletion]
  )

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

    if (hasCompletion && (key.name === "tab" || (isSubmitKey(key) && !isInsertNewlineKey(key)))) {
      const selected = completion?.items[completionIndex]
      if (selected) {
        applyCompletion(selected)
      }
      return
    }

    if (key.name === "escape") {
      if (hasCompletion) {
        closeCompletion()
      } else {
        onBlur()
      }
      return
    }

    if (isSubmitKey(key) && !isInsertNewlineKey(key)) {
      onExecute(query)
      return
    }

    if (isInsertNewlineKey(key)) {
      const next = `${query.slice(0, cursorPos)}\n${query.slice(cursorPos)}`
      updateQuery(next, cursorPos + 1)
      closeCompletion()
      return
    }

    if (isDeleteWordKey(key)) {
      const result = deleteWordBackward(query, cursorPos)
      updateQuery(result.value, result.cursor)
      refreshCompletion(result.value, result.cursor)
      return
    }

    if (key.name === "left") {
      const nextCursor = Math.max(0, cursorPos - 1)
      setCursorPos(nextCursor)
      refreshCompletion(query, nextCursor)
      return
    }

    if (key.name === "right") {
      const nextCursor = Math.min(query.length, cursorPos + 1)
      setCursorPos(nextCursor)
      refreshCompletion(query, nextCursor)
      return
    }

    if (key.name === "home") {
      setCursorPos(0)
      refreshCompletion(query, 0)
      return
    }

    if (key.name === "end") {
      const nextCursor = query.length
      setCursorPos(nextCursor)
      refreshCompletion(query, nextCursor)
      return
    }

    if (key.name === "backspace") {
      const result = deleteWithAutoPair(query, cursorPos)
      updateQuery(result.value, result.cursor)
      refreshCompletion(result.value, result.cursor)
      return
    }

    if (key.name === "delete") {
      if (cursorPos >= query.length) return
      const next = `${query.slice(0, cursorPos)}${query.slice(cursorPos + 1)}`
      updateQuery(next, cursorPos)
      refreshCompletion(next, cursorPos)
      return
    }

    const printable = getPrintableKey(key)
    if (printable) {
      const paired = insertWithAutoPair(query, cursorPos, printable)
      updateQuery(paired.value, paired.cursor)
      refreshCompletion(paired.value, paired.cursor)
    }
  })

  return (
    <box flexGrow={1} flexDirection="column" padding={1}>
      <text fg="#565f89">Enter run • Ctrl+Enter newline • Esc exit input</text>
      <box height={1}>
        <text fg="#414868">{"─".repeat(200)}</text>
      </box>
      {error && <text fg="#f7768e">{error}</text>}
      <box flexGrow={1} flexDirection="column">
        {lines.length === 0 ? (
          <>
            <text fg="#565f89">Type query...</text>
            <text fg="#565f89">Mongo examples: db.users.find(&#123;&#125;)</text>
            <text fg="#565f89">db.users.find(&#123;"year": &#123;"$gte": 2000&#125;&#125;).sort(&#123;"year": -1&#125;).limit(20)</text>
          </>
        ) : (
          lines.map((line, index) => {
            if (!focused || index !== cursorLine) {
              return (
                <text key={index} fg="#a9b1d6">
                  {line || " "}
                </text>
              )
            }

            const safeColumn = clamp(cursorColumn, 0, line.length)
            const before = line.slice(0, safeColumn)
            const current = line[safeColumn]
            const after = line.slice(safeColumn + (current ? 1 : 0))

            const completionLeft = Math.max(0, safeColumn)

            return (
              <box key={index} flexDirection="column">
                <text fg="#c0caf5">
                  {before}
                  {current ? (
                    <span fg="#1a1b26" bg="#7aa2f7">
                      {current}
                    </span>
                  ) : (
                    <span fg="#7aa2f7">█</span>
                  )}
                  {after}
                </text>
                {completion && completion.items.length > 0 && (
                  <box flexDirection="row">
                    {completionLeft > 0 && <box width={completionLeft} />}
                    <CompletionMenu visible={true} items={completion.items} selectedIndex={completionIndex} />
                  </box>
                )}
              </box>
            )
          })
        )}
      </box>
    </box>
  )
}
