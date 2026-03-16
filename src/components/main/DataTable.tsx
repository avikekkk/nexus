import { useState, useMemo, useCallback, useEffect } from "react"
import { useKeyboard, useTerminalDimensions } from "@opentui/react"
import type { MouseEvent as TuiMouseEvent } from "@opentui/core"
import type { QueryResult, ColumnDef } from "../../db/types.ts"

interface DataTableProps {
  result: QueryResult
  focused: boolean
  currentOffset: number
  pageSize: number
  onPageChange?: (offset: number) => void
  onCellSelect?: (row: number, col: number, value: unknown) => void
  sidebarWidth?: number
}

const COLORS = {
  header: "#7aa2f7",
  headerBg: "#1a1b26",
  separator: "#414868",
  selectedRow: "#283457",
  selectedCell: "#364a82",
  string: "#9ece6a",
  number: "#7dcfff",
  boolean: "#e0af68",
  null: "#565f89",
  object: "#bb9af7",
  text: "#a9b1d6",
  dim: "#565f89",
  rowNum: "#414868",
  pageBg: "#1a1b26",
  pageActive: "#7aa2f7",
  pageInactive: "#565f89",
  footerBg: "#1a1b26",
}

const MIN_COL_WIDTH = 4
const MAX_COL_WIDTH = 30
const SAMPLE_ROWS = 20
const ROW_NUM_WIDTH = 4
const COL_SEPARATOR = " │ "

function getValueType(value: unknown): keyof typeof COLORS {
  if (value === null || value === undefined) return "null"
  if (typeof value === "string") return "string"
  if (typeof value === "number") return "number"
  if (typeof value === "boolean") return "boolean"
  if (typeof value === "object") return "object"
  return "text"
}

function formatCellValue(value: unknown, maxWidth: number): string {
  let str: string
  if (value === null || value === undefined) {
    str = "null"
  } else if (typeof value === "object") {
    try {
      str = JSON.stringify(value)
    } catch {
      str = "[object]"
    }
  } else {
    str = String(value)
  }

  // Replace newlines/tabs with visible placeholders
  str = str.replace(/\n/g, "↵").replace(/\t/g, "→").replace(/\r/g, "")

  if (str.length > maxWidth) {
    return str.slice(0, maxWidth - 1) + "…"
  }
  return str
}

function padCell(text: string, width: number): string {
  if (text.length >= width) return text.slice(0, width)
  return text + " ".repeat(width - text.length)
}

function computeColumnWidths(
  columns: ColumnDef[],
  rows: Record<string, unknown>[],
  availableWidth: number
): number[] {
  // First pass: compute ideal widths from data
  const widths: number[] = columns.map((col) => Math.min(MAX_COL_WIDTH, Math.max(MIN_COL_WIDTH, col.name.length)))

  const sampleRows = rows.slice(0, SAMPLE_ROWS)
  for (const row of sampleRows) {
    for (let i = 0; i < columns.length; i++) {
      const col = columns[i]!
      const value = row[col.name]
      const formatted = formatCellValue(value, MAX_COL_WIDTH)
      widths[i] = Math.min(MAX_COL_WIDTH, Math.max(widths[i]!, formatted.length))
    }
  }

  // Second pass: shrink columns to fit available width
  // Account for: paddingX(1+1) + row numbers + separators between columns
  const separatorWidth = COL_SEPARATOR.length
  const fixedOverhead = 2 + ROW_NUM_WIDTH + separatorWidth // padding + row num + separator after row num
  const separatorTotal = Math.max(0, columns.length - 1) * separatorWidth
  const totalIdeal = widths.reduce((a, b) => a + b, 0) + separatorTotal + fixedOverhead

  if (totalIdeal > availableWidth && columns.length > 0) {
    const budget = Math.max(columns.length * MIN_COL_WIDTH, availableWidth - separatorTotal - fixedOverhead)
    const ratio = budget / widths.reduce((a, b) => a + b, 0)
    for (let i = 0; i < widths.length; i++) {
      widths[i] = Math.max(MIN_COL_WIDTH, Math.floor(widths[i]! * ratio))
    }
  }

  return widths
}

export function DataTable({
  result,
  focused,
  currentOffset,
  pageSize,
  onPageChange,
  onCellSelect,
  sidebarWidth = 0,
}: DataTableProps) {
  const { width: termWidth, height: termHeight } = useTerminalDimensions()
  const [selectedRow, setSelectedRow] = useState(0)
  const [selectedCol, setSelectedCol] = useState(0)
  const [scrollOffset, setScrollOffset] = useState(0)
  const [colScrollOffset, setColScrollOffset] = useState(0)

  const { columns, rows, totalCount } = result

  // Reset selection when data changes (e.g., page change)
  useEffect(() => {
    if (selectedRow >= rows.length && rows.length > 0) {
      setSelectedRow(rows.length - 1)
    }
  }, [rows.length])

  // Available width for the table (subtract sidebar, main panel border, internal padding)
  // sidebarWidth includes its own border; main panel has 2 chars for border (rounded)
  const availableWidth = Math.max(20, termWidth - sidebarWidth - 4)

  const columnWidths = useMemo(
    () => computeColumnWidths(columns, rows, availableWidth),
    [columns, rows, availableWidth]
  )

  // Calculate which columns are visible based on horizontal scroll
  const visibleColumns = useMemo(() => {
    const fixedOverhead = 2 + ROW_NUM_WIDTH + COL_SEPARATOR.length
    let usedWidth = fixedOverhead
    const visible: number[] = []

    for (let i = colScrollOffset; i < columns.length; i++) {
      const colWidth = columnWidths[i]!
      const sepWidth = visible.length > 0 ? COL_SEPARATOR.length : 0
      if (usedWidth + colWidth + sepWidth > availableWidth && visible.length > 0) break
      usedWidth += colWidth + sepWidth
      visible.push(i)
    }

    // Ensure selected column is visible
    if (visible.length > 0 && !visible.includes(selectedCol)) {
      // Recalculate from selectedCol
      return null // Signal to recalculate
    }

    return visible
  }, [colScrollOffset, columns.length, columnWidths, availableWidth, selectedCol])

  // Auto-adjust column scroll to keep selected column visible
  const effectiveVisibleCols = useMemo(() => {
    if (visibleColumns !== null) return visibleColumns

    // Recalculate starting from selectedCol going backwards to fit as many as possible
    const fixedOverhead = 2 + ROW_NUM_WIDTH + COL_SEPARATOR.length
    let usedWidth = fixedOverhead
    let startCol = selectedCol

    // First, ensure selectedCol fits
    usedWidth += columnWidths[selectedCol]!

    // Try to include columns before selectedCol
    for (let i = selectedCol - 1; i >= 0; i--) {
      const needed = columnWidths[i]! + COL_SEPARATOR.length
      if (usedWidth + needed > availableWidth) break
      usedWidth += needed
      startCol = i
    }

    // Now build the visible list forward
    const visible: number[] = []
    let w = fixedOverhead
    for (let i = startCol; i < columns.length; i++) {
      const colWidth = columnWidths[i]!
      const sepWidth = visible.length > 0 ? COL_SEPARATOR.length : 0
      if (w + colWidth + sepWidth > availableWidth && visible.length > 0) break
      w += colWidth + sepWidth
      visible.push(i)
    }

    return visible
  }, [visibleColumns, selectedCol, columnWidths, columns.length, availableWidth])

  // Sync colScrollOffset when visible columns change
  const effectiveColScroll = effectiveVisibleCols.length > 0 ? effectiveVisibleCols[0]! : 0
  useEffect(() => {
    if (effectiveColScroll !== colScrollOffset) {
      setColScrollOffset(effectiveColScroll)
    }
  }, [effectiveColScroll, colScrollOffset])

  // Available height for data rows (subtract header, separator, footer, pagination)
  const headerHeight = 1
  const separatorHeight = 1
  const footerHeight = 1
  const paginationHeight = 1
  const availableHeight = Math.max(1, termHeight - headerHeight - separatorHeight - footerHeight - paginationHeight - 4)
  const visibleRowCount = availableHeight

  // Pagination
  const currentPage = Math.floor(currentOffset / pageSize) + 1
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize))
  const hasNextPage = currentOffset + pageSize < totalCount
  const hasPrevPage = currentOffset > 0

  const updateScroll = useCallback(
    (newRow: number) => {
      setScrollOffset((prev) => {
        if (newRow < prev) return newRow
        if (newRow >= prev + visibleRowCount) return newRow - visibleRowCount + 1
        return prev
      })
    },
    [visibleRowCount]
  )

  const moveSelection = useCallback(
    (rowDelta: number, colDelta: number) => {
      if (rowDelta !== 0) {
        setSelectedRow((r) => {
          const newRow = Math.max(0, Math.min(rows.length - 1, r + rowDelta))
          updateScroll(newRow)
          return newRow
        })
      }
      if (colDelta !== 0) {
        setSelectedCol((c) => Math.max(0, Math.min(columns.length - 1, c + colDelta)))
      }
    },
    [rows.length, columns.length, updateScroll]
  )

  const jumpToRow = useCallback(
    (row: number) => {
      const newRow = Math.max(0, Math.min(rows.length - 1, row))
      setSelectedRow(newRow)
      updateScroll(newRow)
    },
    [rows.length, updateScroll]
  )

  useKeyboard((key) => {
    if (!focused) return

    // Arrow keys
    if (key.name === "down" || key.name === "j") {
      moveSelection(1, 0)
      return
    }
    if (key.name === "up" || key.name === "k") {
      moveSelection(-1, 0)
      return
    }
    if (key.name === "right" || key.name === "l") {
      moveSelection(0, 1)
      return
    }
    if (key.name === "left" || key.name === "h") {
      moveSelection(0, -1)
      return
    }

    // Page navigation (within current page data)
    if (key.name === "pagedown") {
      moveSelection(visibleRowCount, 0)
      return
    }
    if (key.name === "pageup") {
      moveSelection(-visibleRowCount, 0)
      return
    }

    // Jump to start/end of current data
    if (key.name === "home" || (key.name === "g" && !key.shift)) {
      jumpToRow(0)
      return
    }
    if (key.name === "end" || (key.name === "g" && key.shift)) {
      jumpToRow(rows.length - 1)
      return
    }

    // Database pagination: n = next page, p = prev page
    if (key.name === "n" && hasNextPage && onPageChange) {
      onPageChange(currentOffset + pageSize)
      setSelectedRow(0)
      setScrollOffset(0)
      return
    }
    if (key.name === "p" && hasPrevPage && onPageChange) {
      onPageChange(Math.max(0, currentOffset - pageSize))
      setSelectedRow(0)
      setScrollOffset(0)
      return
    }

    // Select cell
    if (key.name === "return") {
      if (onCellSelect && rows[selectedRow] && columns[selectedCol]) {
        const value = rows[selectedRow][columns[selectedCol].name]
        onCellSelect(selectedRow, selectedCol, value)
      }
      return
    }
  })

  // Mouse scroll handler for vertical and horizontal scrolling
  const handleMouseScroll = useCallback(
    (event: TuiMouseEvent) => {
      if (!focused || !event.scroll) return
      const { direction, delta } = event.scroll

      if (direction === "up" || direction === "down") {
        // Shift+scroll = horizontal scrolling
        if (event.modifiers.shift) {
          const colDelta = direction === "down" ? 1 : -1
          moveSelection(0, colDelta * Math.max(1, delta))
        } else {
          // Vertical scrolling: move row selection
          const rowDelta = direction === "down" ? 1 : -1
          moveSelection(rowDelta * Math.max(1, delta), 0)
        }
      } else if (direction === "left" || direction === "right") {
        const colDelta = direction === "right" ? 1 : -1
        moveSelection(0, colDelta * Math.max(1, delta))
      }
    },
    [focused, moveSelection]
  )

  // Build row number column width
  const rowNumStr = (idx: number) => {
    const num = String(currentOffset + idx + 1)
    return num.length < ROW_NUM_WIDTH ? " ".repeat(ROW_NUM_WIDTH - num.length) + num : num
  }

  // Render header row
  const headerParts: any[] = [
    <span key="__rownum" fg={COLORS.dim}>
      {padCell("#", ROW_NUM_WIDTH)}
      {COL_SEPARATOR}
    </span>,
  ]
  for (let vi = 0; vi < effectiveVisibleCols.length; vi++) {
    const colIdx = effectiveVisibleCols[vi]!
    const col = columns[colIdx]!
    const w = columnWidths[colIdx]!
    const text = padCell(formatCellValue(col.name, w), w)
    headerParts.push(
      <span key={col.name} fg={COLORS.header}>
        {text}
        {vi < effectiveVisibleCols.length - 1 ? <span fg={COLORS.separator}>{COL_SEPARATOR}</span> : ""}
      </span>
    )
  }

  // Render separator
  const sepParts = [
    "─".repeat(ROW_NUM_WIDTH) + "─┼─",
    ...effectiveVisibleCols.map((colIdx, vi) => {
      const w = columnWidths[colIdx]!
      return "─".repeat(w) + (vi < effectiveVisibleCols.length - 1 ? "─┼─" : "")
    }),
  ]
  const separatorLine = sepParts.join("")

  // Render data rows
  const dataRows: any[] = []
  for (let viewIdx = 0; viewIdx < visibleRowCount; viewIdx++) {
    const actualRowIdx = scrollOffset + viewIdx
    if (actualRowIdx >= rows.length) break

    const row = rows[actualRowIdx]!
    const isSelectedRow = actualRowIdx === selectedRow

    const cellParts: any[] = [
      <span key="__rownum" fg={COLORS.rowNum}>
        {rowNumStr(actualRowIdx)}
        <span fg={COLORS.separator}>{COL_SEPARATOR}</span>
      </span>,
    ]

    for (let vi = 0; vi < effectiveVisibleCols.length; vi++) {
      const colIdx = effectiveVisibleCols[vi]!
      const col = columns[colIdx]!
      const w = columnWidths[colIdx]!
      const value = row[col.name]
      const formatted = formatCellValue(value, w)
      const padded = padCell(formatted, w)
      const valueType = getValueType(value)
      const color = COLORS[valueType]
      const isSelectedCell = isSelectedRow && colIdx === selectedCol

      cellParts.push(
        <span key={col.name} fg={color} bg={isSelectedCell ? COLORS.selectedCell : undefined}>
          {padded}
          {vi < effectiveVisibleCols.length - 1 ? <span fg={COLORS.separator}>{COL_SEPARATOR}</span> : ""}
        </span>
      )
    }

    dataRows.push(
      <box key={actualRowIdx} height={1} flexDirection="row" backgroundColor={isSelectedRow ? COLORS.selectedRow : undefined}>
        <text>{cellParts}</text>
      </box>
    )
  }

  // Horizontal scroll indicator
  const hasColsLeft = effectiveColScroll > 0
  const hasColsRight = effectiveVisibleCols.length > 0
    && effectiveVisibleCols[effectiveVisibleCols.length - 1]! < columns.length - 1

  // Pagination bar
  const pageInfo = `Page ${currentPage}/${totalPages}`
  const rowRange = rows.length > 0
    ? `Rows ${currentOffset + 1}–${currentOffset + rows.length} of ${totalCount}`
    : "No rows"
  const colInfo = `Col ${selectedCol + 1}/${columns.length}`
  const scrollHint = [
    hasColsLeft ? "◀" : "",
    hasColsRight ? "▶" : "",
  ].filter(Boolean).join(" ")
  const navHint = [
    hasPrevPage ? "[p]prev" : "",
    hasNextPage ? "[n]next" : "",
  ].filter(Boolean).join("  ")

  return (
    <box flexDirection="column" flexGrow={1} onMouseScroll={handleMouseScroll}>
      {/* Header */}
      <box height={1} backgroundColor={COLORS.headerBg} paddingX={1}>
        <text>{headerParts}</text>
      </box>

      {/* Separator */}
      <box height={1} paddingX={1}>
        <text fg={COLORS.separator}>{separatorLine}</text>
      </box>

      {/* Data rows */}
      <box flexDirection="column" flexGrow={1} paddingX={1}>
        {dataRows.length > 0 ? dataRows : (
          <box justifyContent="center" alignItems="center" flexGrow={1}>
            <text fg={COLORS.dim}>No data</text>
          </box>
        )}
      </box>

      {/* Footer / Pagination */}
      <box height={1} paddingX={1} flexDirection="row" backgroundColor={COLORS.footerBg}>
        <text fg={COLORS.dim}>
          {rowRange}
          {"  "}
          <span fg={COLORS.pageActive}>{pageInfo}</span>
          {"  "}
          {colInfo}
          {scrollHint ? `  ${scrollHint}` : ""}
          {navHint ? (
            <>
              {"  "}
              <span fg={COLORS.pageInactive}>{navHint}</span>
            </>
          ) : null}
        </text>
      </box>
    </box>
  )
}
