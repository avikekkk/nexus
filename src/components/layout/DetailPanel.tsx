import { useState, useEffect, useMemo, useCallback, useRef } from "react"
import { useKeyboard } from "@opentui/react"
import type { MouseEvent as TuiMouseEvent, ScrollBoxRenderable } from "@opentui/core"
import type { DbType } from "../../db/types.ts"
import { formatBytes, stringifyValue, parseEditedValue, getTypeName } from "../../utils/detailValue.ts"
import { deleteWordBackward, getPrintableKey, isDeleteWordKey, isInsertNewlineKey } from "../../utils/keyInput.ts"

interface DetailPanelProps {
  width: number
  height: number
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
  height,
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
  const [measuredViewportRows, setMeasuredViewportRows] = useState<number | null>(null)
  const scrollRef = useRef<ScrollBoxRenderable | null>(null)
  const preferredColumnRef = useRef<number | null>(null)
  const innerWidth = Math.max(12, width - 4)
  const visibleContentRows = Math.max(3, height - 11)
  const effectiveVisibleRows = measuredViewportRows ?? visibleContentRows
  const effectiveContentCols = Math.max(1, innerWidth - 1)

  useEffect(() => {
    const text = stringifyValue(originalValue)
    setValue(text)
    setCursorPos(0)
    setError(null)
    setIsApplying(false)
    setViewportTop(0)
    setConfirmClose(false)
    preferredColumnRef.current = 0
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

  const currentLineIndex = useMemo(() => {
    let idx = 0
    for (let i = 0; i < lineStarts.length; i++) {
      if (lineStarts[i]! <= cursorPos) idx = i
      else break
    }
    return idx
  }, [lineStarts, cursorPos])

  const clipLine = useCallback((text: string, max = innerWidth) => {
    if (max <= 1) return ""
    if (text.length <= max) return text
    return `${text.slice(0, Math.max(0, max - 1))}…`
  }, [innerWidth])

  const cursorLineStart = lineStarts[currentLineIndex] ?? 0
  const cursorColumn = cursorPos - cursorLineStart

  const visualMetrics = useMemo(() => {
    const lineStartRows: number[] = []
    let totalVisualLines = 0

    for (const line of contentLines) {
      lineStartRows.push(totalVisualLines)
      const lineVisualRows = Math.max(1, Math.ceil(line.length / effectiveContentCols))
      totalVisualLines += lineVisualRows
    }

    return {
      lineStartRows,
      totalVisualLines: Math.max(1, totalVisualLines),
    }
  }, [contentLines, effectiveContentCols])

  const currentVisualLine = useMemo(() => {
    const lineBase = visualMetrics.lineStartRows[currentLineIndex] ?? 0
    const wrappedOffset = Math.floor(Math.max(0, cursorColumn) / effectiveContentCols)
    return lineBase + wrappedOffset
  }, [visualMetrics, currentLineIndex, cursorColumn, effectiveContentCols])

  const maxViewportTop = Math.max(0, visualMetrics.totalVisualLines - effectiveVisibleRows)

  useEffect(() => {
    setViewportTop((prev) => {
      const followBottomMargin = 1
      if (currentVisualLine < prev) {
        return currentVisualLine
      }
      if (currentVisualLine >= prev + effectiveVisibleRows - followBottomMargin) {
        return Math.max(0, currentVisualLine - effectiveVisibleRows + 1 + followBottomMargin)
      }
      return prev
    })
  }, [currentVisualLine, effectiveVisibleRows])

  useEffect(() => {
    setViewportTop((prev) => Math.min(prev, maxViewportTop))
  }, [maxViewportTop])

  useEffect(() => {
    const scrollbox = scrollRef.current
    if (!scrollbox) return

    const measuredRows = Math.max(1, scrollbox.viewport.height)
    setMeasuredViewportRows((prev) => (prev === measuredRows ? prev : measuredRows))
    scrollbox.scrollTo({ x: 0, y: viewportTop })
  }, [viewportTop, height, width, value])

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

  const moveCursorVertical = useCallback(
    (direction: -1 | 1) => {
      const targetLineIndex = currentLineIndex + direction
      if (targetLineIndex < 0 || targetLineIndex >= contentLines.length) return

      const currentLineStart = lineStarts[currentLineIndex] ?? 0
      const targetLineStart = lineStarts[targetLineIndex] ?? 0
      const targetLineLength = contentLines[targetLineIndex]?.length ?? 0
      const currentColumn = cursorPos - currentLineStart
      const preferredColumn = preferredColumnRef.current ?? currentColumn
      const nextColumn = Math.min(preferredColumn, targetLineLength)

      preferredColumnRef.current = preferredColumn
      setCursorPos(targetLineStart + nextColumn)
      setConfirmClose(false)
    },
    [contentLines, currentLineIndex, cursorPos, lineStarts]
  )

  useKeyboard((key) => {
    if (!focused) return

    if (key.name === "escape" || key.name === "q") {
      closeOrConfirm()
      return
    }

    if (key.name === "left") {
      preferredColumnRef.current = null
      setCursorPos((prev) => Math.max(0, prev - 1))
      setConfirmClose(false)
      return
    }

    if (key.name === "right") {
      preferredColumnRef.current = null
      setCursorPos((prev) => Math.min(value.length, prev + 1))
      setConfirmClose(false)
      return
    }

    if (key.name === "up") {
      moveCursorVertical(-1)
      return
    }

    if (key.name === "down") {
      moveCursorVertical(1)
      return
    }

    if (key.name === "home") {
      preferredColumnRef.current = null
      setCursorPos(0)
      setViewportTop(0)
      setConfirmClose(false)
      return
    }

    if (key.name === "end") {
      preferredColumnRef.current = null
      setCursorPos(value.length)
      setViewportTop(maxViewportTop)
      setConfirmClose(false)
      return
    }

    if (key.ctrl && key.name === "u") {
      scrollBy(-1)
      return
    }

    if (key.ctrl && key.name === "d") {
      scrollBy(1)
      return
    }

    if (key.name === "pageup") {
      scrollBy(-effectiveVisibleRows)
      return
    }

    if (key.name === "pagedown") {
      scrollBy(effectiveVisibleRows)
      return
    }

    if (key.ctrl && key.name === "l") {
      preferredColumnRef.current = null
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

    if (isInsertNewlineKey(key)) {
      const before = value.slice(0, cursorPos)
      const after = value.slice(cursorPos)
      preferredColumnRef.current = null
      setValue(before + "\n" + after)
      setCursorPos(cursorPos + 1)
      setConfirmClose(false)
      return
    }

    if (isDeleteWordKey(key)) {
      const result = deleteWordBackward(value, cursorPos)
      preferredColumnRef.current = null
      setValue(result.value)
      setCursorPos(result.cursor)
      setConfirmClose(false)
      return
    }

    if (key.name === "backspace") {
      if (cursorPos === 0) return
      preferredColumnRef.current = null
      setValue((prev) => prev.slice(0, cursorPos - 1) + prev.slice(cursorPos))
      setCursorPos((prev) => Math.max(0, prev - 1))
      setConfirmClose(false)
      return
    }

    if (key.name === "delete") {
      if (cursorPos >= value.length) return
      preferredColumnRef.current = null
      setValue((prev) => prev.slice(0, cursorPos) + prev.slice(cursorPos + 1))
      setConfirmClose(false)
      return
    }

    const printable = getPrintableKey(key)
    if (printable) {
      const before = value.slice(0, cursorPos)
      const after = value.slice(cursorPos)
      preferredColumnRef.current = null
      setValue(before + printable + after)
      setCursorPos(cursorPos + 1)
      setConfirmClose(false)
    }
  })

  const handleMouseScroll = useCallback(
    (event: TuiMouseEvent) => {
      if (!event.scroll) return
      const delta = Math.max(1, event.scroll.delta)
      if (event.scroll.direction === "up") scrollBy(-delta)
      if (event.scroll.direction === "down") scrollBy(delta)
    },
    [focused, scrollBy]
  )

  const rowPreview = useMemo(() => {
    try {
      return JSON.stringify(rowData)
    } catch {
      return "[unserializable row]"
    }
  }, [rowData])

  return (
    <box
      width={width}
      height={height}
      flexDirection="column"
      border
      borderStyle="rounded"
      borderColor={borderColor}
      title=" Detail "
      titleAlignment="left"
    >
      <box height={4} flexDirection="column" paddingX={1}>
        <text fg="#7aa2f7">{clipLine(tabLabel)}</text>
        <text fg="#c0caf5">{clipLine(`Field: ${fieldName}`)}</text>
        <text fg="#565f89">{clipLine(`Type: ${metadata.type}  Size: ${metadata.size}`)}</text>
        <text fg="#414868">{clipLine("Apply: Ctrl+A  Close: Esc/q")}</text>
      </box>

      <box height={1} paddingX={1}>
        <text fg="#414868">{"─".repeat(innerWidth)}</text>
      </box>

      <scrollbox
        ref={scrollRef}
        flexGrow={1}
        paddingX={1}
        scrollY
        scrollX={false}
        onMouseScroll={handleMouseScroll}
        verticalScrollbarOptions={{
          showArrows: false,
          trackOptions: {
            backgroundColor: "#1a1b26",
            foregroundColor: "#414868",
          },
        }}
      >
        {value.length === 0 ? (
          <text fg="#565f89">(empty)</text>
        ) : (
          contentLines.map((line, index) => {
            const isCursorLine = focused && index === currentLineIndex

            if (!isCursorLine || cursorColumn < 0 || cursorColumn > line.length) {
              return (
                <text key={`line-${index}`} fg="#a9b1d6">
                  {line}
                </text>
              )
            }

            const cursorAtEnd = cursorColumn === line.length
            const before = line.slice(0, cursorColumn)
            const ch = cursorAtEnd ? " " : line[cursorColumn]
            const after = cursorAtEnd ? "" : line.slice(cursorColumn + 1)

            return (
              <text key={`line-${index}`} fg="#a9b1d6">
                {before}
                <span fg="#1a1b26" bg="#7aa2f7">
                  {ch}
                </span>
                {after}
              </text>
            )
          })
        )}
      </scrollbox>

      <box height={1} paddingX={1}>
        <text fg="#414868">{"─".repeat(innerWidth)}</text>
      </box>

      <box height={3} flexDirection="column" paddingX={1}>
        {error ? <text fg="#f7768e">{clipLine(error)}</text> : <text fg="#565f89">{clipLine(`Row preview: ${rowPreview}`)}</text>}
        <text fg="#565f89">{clipLine("Ctrl+L clear  Ctrl+Enter newline  PgUp/PgDn scroll")}</text>
        {isApplying ? (
          <text fg="#e0af68">Applying...</text>
        ) : (
          <text fg="#414868">
            {clipLine(`Lines ${viewportTop + 1}-${Math.min(visualMetrics.totalVisualLines, viewportTop + effectiveVisibleRows)} of ${visualMetrics.totalVisualLines}`)}
          </text>
        )}
      </box>
    </box>
  )
}
