import { useState, useEffect, useMemo, useCallback } from "react"
import { useKeyboard, useTerminalDimensions } from "@opentui/react"
import type { MouseEvent as TuiMouseEvent } from "@opentui/core"
import type { DbType } from "../../db/types.ts"
import { formatBytes, stringifyValue, parseEditedValue, getTypeName } from "../../utils/detailValue.ts"

interface DetailPanelProps {
  width: number
  focused: boolean
  dbType: DbType
  tabLabel: string
  fieldName: string
  rowData: Record<string, unknown>
  originalValue: unknown
  onClose: () => void
  onApply: (value: unknown) => Promise<void>
}
export function DetailPanel({
  width,
  focused,
  tabLabel,
  fieldName,
  rowData,
  originalValue,
  onClose,
  onApply,
  dbType,
}: DetailPanelProps) {
  const borderColor = focused ? "#7aa2f7" : "#414868"
  const [value, setValue] = useState(stringifyValue(originalValue))
  const [cursorPos, setCursorPos] = useState(value.length)
  const [error, setError] = useState<string | null>(null)
  const [isApplying, setIsApplying] = useState(false)
  const [viewportTop, setViewportTop] = useState(0)
  const [confirmClose, setConfirmClose] = useState(false)
  const { height: termHeight } = useTerminalDimensions()

  useEffect(() => {
    const text = stringifyValue(originalValue)
    setValue(text)
    setCursorPos(text.length)
    setError(null)
    setIsApplying(false)
    setViewportTop(0)
    setConfirmClose(false)
  }, [originalValue, fieldName])

  const dirty = value !== stringifyValue(originalValue)

  const metadata = useMemo(() => {
    const type = getTypeName(originalValue)
    const size = formatBytes(originalValue)
    return { type, size }
  }, [originalValue])

  const lineStarts = useMemo(() => {
    const starts: number[] = [0]
    for (let i = 0; i < value.length; i++) {
      if (value[i] === "\n") starts.push(i + 1)
    }
    return starts
  }, [value])

  const contentLines = useMemo(() => value.split("\n"), [value])
  const totalLines = contentLines.length

  const currentLineIndex = useMemo(() => {
    let idx = 0
    for (let i = 0; i < lineStarts.length; i++) {
      if (lineStarts[i]! <= cursorPos) idx = i
      else break
    }
    return idx
  }, [lineStarts, cursorPos])

  const visibleContentRows = Math.max(3, termHeight - 14)
  const maxViewportTop = Math.max(0, totalLines - visibleContentRows)

  useEffect(() => {
    if (currentLineIndex < viewportTop) {
      setViewportTop(currentLineIndex)
    } else if (currentLineIndex >= viewportTop + visibleContentRows) {
      setViewportTop(Math.max(0, currentLineIndex - visibleContentRows + 1))
    }
  }, [currentLineIndex, viewportTop, visibleContentRows])

  useEffect(() => {
    setViewportTop((prev) => Math.min(prev, maxViewportTop))
  }, [maxViewportTop])

  const closeOrConfirm = useCallback(() => {
    if (dirty && !confirmClose) {
      setConfirmClose(true)
      setError("Unsaved changes. Press Esc/q again to discard, or Ctrl+A to apply.")
      return
    }
    setConfirmClose(false)
    onClose()
  }, [dirty, confirmClose, onClose])

  const scrollBy = useCallback(
    (delta: number) => {
      setViewportTop((prev) => Math.max(0, Math.min(maxViewportTop, prev + delta)))
    },
    [maxViewportTop]
  )

  useKeyboard((key) => {
    if (!focused) return

    if (key.name === "escape" || key.name === "q") {
      closeOrConfirm()
      return
    }

    if (key.name === "left") {
      setCursorPos((prev) => Math.max(0, prev - 1))
      setConfirmClose(false)
      return
    }

    if (key.name === "right") {
      setCursorPos((prev) => Math.min(value.length, prev + 1))
      setConfirmClose(false)
      return
    }

    if (key.name === "home") {
      setCursorPos(0)
      setConfirmClose(false)
      return
    }

    if (key.name === "end") {
      setCursorPos(value.length)
      setConfirmClose(false)
      return
    }

    if (key.name === "up" || (key.ctrl && key.name === "u")) {
      scrollBy(-1)
      return
    }

    if (key.name === "down" || (key.ctrl && key.name === "d")) {
      scrollBy(1)
      return
    }

    if (key.name === "pageup") {
      scrollBy(-visibleContentRows)
      return
    }

    if (key.name === "pagedown") {
      scrollBy(visibleContentRows)
      return
    }

    if (key.ctrl && key.name === "l") {
      setValue("")
      setCursorPos(0)
      setError(null)
      setConfirmClose(false)
      return
    }

    if (key.ctrl && key.name === "a") {
      const parsed = parseEditedValue(dbType, value, originalValue)
      if (parsed.error) {
        setError(parsed.error)
        return
      }

      setError(null)
      setConfirmClose(false)
      setIsApplying(true)
      onApply(parsed.value)
        .catch((e) => {
          setError(e instanceof Error ? e.message : String(e))
        })
        .finally(() => {
          setIsApplying(false)
        })
      return
    }

    if (key.name === "return" && key.shift) {
      const before = value.slice(0, cursorPos)
      const after = value.slice(cursorPos)
      setValue(before + "\n" + after)
      setCursorPos(cursorPos + 1)
      setConfirmClose(false)
      return
    }

    if (key.name === "backspace") {
      if (cursorPos === 0) return
      setValue((prev) => prev.slice(0, cursorPos - 1) + prev.slice(cursorPos))
      setCursorPos((prev) => Math.max(0, prev - 1))
      setConfirmClose(false)
      return
    }

    if (key.name === "delete") {
      if (cursorPos >= value.length) return
      setValue((prev) => prev.slice(0, cursorPos) + prev.slice(cursorPos + 1))
      setConfirmClose(false)
      return
    }

    if (key.sequence && key.sequence.length === 1 && !key.ctrl) {
      const before = value.slice(0, cursorPos)
      const after = value.slice(cursorPos)
      setValue(before + key.sequence + after)
      setCursorPos(cursorPos + 1)
      setConfirmClose(false)
    }
  })

  const handleMouseScroll = useCallback(
    (event: TuiMouseEvent) => {
      if (!focused || !event.scroll) return
      const delta = Math.max(1, event.scroll.delta)
      if (event.scroll.direction === "up") scrollBy(-delta)
      if (event.scroll.direction === "down") scrollBy(delta)
    },
    [focused, scrollBy]
  )

  const prettyRow = JSON.stringify(rowData, null, 2)
  const visibleLines = contentLines.slice(viewportTop, viewportTop + visibleContentRows)
  return (
    <box
      width={width}
      flexDirection="column"
      border
      borderStyle="rounded"
      borderColor={borderColor}
      title=" Detail "
      titleAlignment="left"
    >
      <box height={4} flexDirection="column" paddingX={1}>
        <text fg="#7aa2f7">{tabLabel}</text>
        <text fg="#c0caf5">Field: {fieldName}</text>
        <text fg="#565f89">Type: {metadata.type}  Size: {metadata.size}</text>
        <text fg="#414868">Apply: Ctrl+A  Close: Esc/q</text>
      </box>

      <box height={1} paddingX={1}>
        <text fg="#414868">{"─".repeat(200)}</text>
      </box>

      <box flexGrow={1} flexDirection="column" paddingX={1} onMouseScroll={handleMouseScroll}>
        {visibleLines.length > 0 ? (
          visibleLines.map((line, localIdx) => {
            const idx = viewportTop + localIdx
            const isCursorLine = focused && idx === currentLineIndex
            const lineStart = lineStarts[idx] ?? 0
            const cursorInLine = cursorPos - lineStart
            if (!isCursorLine || cursorInLine < 0 || cursorInLine > line.length) {
              return (
                <text key={`line-${idx}`} fg="#a9b1d6">
                  {line}
                </text>
              )
            }
            const before = line.slice(0, cursorInLine)
            const ch = line[cursorInLine] ?? " "
            const after = line.slice(cursorInLine + (cursorInLine < line.length ? 1 : 0))
            return (
              <text key={`line-${idx}`} fg="#a9b1d6">
                {before}
                <span fg="#1a1b26" bg="#7aa2f7">
                  {ch}
                </span>
                {after}
              </text>
            )
          })
        ) : (
          <text fg="#565f89">(empty)</text>
        )}
      </box>

      <box height={1} paddingX={1}>
        <text fg="#414868">{"─".repeat(200)}</text>
      </box>

      <box height={3} flexDirection="column" paddingX={1}>
        {error ? <text fg="#f7768e">{error}</text> : <text fg="#565f89">Row preview: {prettyRow}</text>}
        <text fg="#565f89">Ctrl+L clear  Shift+Enter newline  PgUp/PgDn scroll</text>
        {isApplying ? (
          <text fg="#e0af68">Applying...</text>
        ) : (
          <text fg="#414868">Lines {viewportTop + 1}-{Math.min(totalLines, viewportTop + visibleContentRows)} of {totalLines}</text>
        )}
      </box>
    </box>
  )
}
