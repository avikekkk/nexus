import { useState, useEffect, useRef, useCallback } from "react"
import { useKeyboard } from "@opentui/react"
import { useApp } from "../../state/AppContext.tsx"
import { DataTable, type SelectedCell } from "../main/DataTable.tsx"
import { FilterBar } from "../main/FilterBar.tsx"
import { DB_TYPE_ICONS, DB_TYPE_COLORS } from "../../constants/dbIcons.ts"

interface MainPanelProps {
  focused: boolean
  sidebarWidth: number
  onOpenDetail: (tabId: string, cell: SelectedCell) => void
}

export function MainPanel({ focused, sidebarWidth, onOpenDetail }: MainPanelProps) {
  const { state, closeTab, nextTab, prevTab, fetchTabData, setTabFilter, setTabSort } = useApp()
  const borderColor = focused ? "#7aa2f7" : "#414868"
  const { tabs, activeTabId, tabData, connections } = state
  const fetchedTabs = useRef(new Set<string>())
  const [filterBarFocused, setFilterBarFocused] = useState(false)

  // Auto-fetch data when a tab becomes active
  useEffect(() => {
    if (activeTabId && !fetchedTabs.current.has(activeTabId)) {
      const data = tabData.get(activeTabId)
      if (!data || (!data.result && !data.loading && !data.error)) {
        fetchedTabs.current.add(activeTabId)
        fetchTabData(activeTabId)
      }
    }
  }, [activeTabId])

  useKeyboard((key) => {
    if (!focused) return

    // Filter bar toggle: f or /
    if ((key.name === "f" || key.name === "/") && activeTab && !filterBarFocused) {
      setFilterBarFocused(true)
      return
    }

    // Don't process other keys if filter bar is focused
    if (filterBarFocused) return

    // Tab switching: ] = next, [ = prev
    if (key.name === "]") {
      nextTab()
      return
    }
    if (key.name === "[") {
      prevTab()
      return
    }

    // Close tab: Ctrl+W or w
    if ((key.ctrl && key.name === "w") || key.name === "w") {
      if (activeTabId) {
        fetchedTabs.current.delete(activeTabId)
        closeTab(activeTabId)
      }
      return
    }

    // Reload: r
    if (key.name === "r") {
      if (activeTabId) {
        fetchedTabs.current.delete(activeTabId)
        fetchTabData(activeTabId)
      }
      return
    }
  })

  const activeTab = tabs.find((t) => t.id === activeTabId)
  const activeData = activeTabId ? tabData.get(activeTabId) : undefined
  const activeConnection = activeTab ? connections.find((c) => c.config.id === activeTab.connectionId) : undefined
  const dbType = activeConnection?.config.type ?? "mongo"

  const handlePageChange = useCallback(
    (offset: number) => {
      if (activeTabId && activeData) {
        fetchTabData(activeTabId, offset, activeData.pageSize)
      }
    },
    [activeTabId, activeData, fetchTabData]
  )

  const handleSortChange = useCallback(
    (sort: Record<string, 1 | -1> | null) => {
      if (activeTabId) {
        setTabSort(activeTabId, sort)
      }
    },
    [activeTabId, setTabSort]
  )

  const handleFilterExecute = useCallback((filter: string) => {
    if (activeTabId) {
      setTabFilter(activeTabId, filter)
      fetchedTabs.current.delete(activeTabId)
      fetchTabData(activeTabId, 0, undefined, filter) // Pass filter directly
      setFilterBarFocused(false)
    }
  }, [activeTabId, setTabFilter, fetchTabData])

  const handleFilterClear = useCallback(() => {
    if (activeTabId) {
      setTabFilter(activeTabId, "")
      setTabSort(activeTabId, null)
      fetchedTabs.current.delete(activeTabId)
      fetchTabData(activeTabId, 0)
    }
  }, [activeTabId, setTabFilter, setTabSort, fetchTabData])

  const handleColumnSort = useCallback(
    (column: string, direction: 1 | -1) => {
      if (activeTabId) {
        // Single column sort (replace existing sort)
        setTabSort(activeTabId, { [column]: direction })
        fetchedTabs.current.delete(activeTabId)
        fetchTabData(activeTabId, 0) // Reset to page 0 on sort change
      }
    },
    [activeTabId, setTabSort, fetchTabData]
  )

  const handleCellSelect = useCallback(
    (cell: SelectedCell) => {
      if (!activeTabId) return
      onOpenDetail(activeTabId, cell)
    },
    [activeTabId, onOpenDetail]
  )

  return (
    <box flexGrow={1} flexDirection="column" border borderStyle="rounded" borderColor={borderColor}>
      {/* Tab bar */}
      <box height={1} paddingX={1} flexDirection="row" gap={0}>
        {tabs.length === 0 ? (
          <text fg="#565f89">No tabs open</text>
        ) : (
          tabs.map((tab) => {
            const isActive = tab.id === activeTabId
            
            // Get connection info for this tab
            const connection = state.connections.find(c => c.config.id === tab.connectionId)
            const dbTypeIcon = connection ? DB_TYPE_ICONS[connection.config.type] : ""
            const iconColor = connection ? DB_TYPE_COLORS[connection.config.type] : "#7aa2f7"
            const connectionName = connection?.config.name || ""
            
            // Format: {icon} {collection} [{connection}]
            const maxLabelLen = 24
            const collectionLabel = tab.label.length > maxLabelLen
              ? tab.label.slice(0, maxLabelLen - 2) + "…"
              : tab.label
            
            if (isActive) {
              return (
                <text key={tab.id} bg="#292e42">
                  <span fg="#7aa2f7">▎</span>
                  <span fg={iconColor}>{dbTypeIcon}</span>
                  <span fg="#c0caf5"> {collectionLabel} </span>
                  <span fg="#565f89">[{connectionName}]</span>
                  <span fg="#414868">▕</span>
                </text>
              )
            }
            return (
              <text key={tab.id}>
                <span fg="#292e42">▎</span>
                <span fg="#565f89">{dbTypeIcon} {collectionLabel} [{connectionName}]</span>
                <span fg="#292e42">▕</span>
              </text>
            )
          })
        )}
      </box>

      {/* Separator */}
      <box height={1} paddingX={0}>
        <text fg="#414868">{"─".repeat(200)}</text>
      </box>

      {/* Content area */}
      {activeTab ? (
        activeData?.loading ? (
          <box flexGrow={1} flexDirection="column" justifyContent="center" alignItems="center">
            <text fg="#e0af68">
              Loading {activeTab.database}.{activeTab.collection}...
            </text>
            <text fg="#565f89">Please wait while query executes</text>
          </box>
        ) : activeData?.error ? (
          <box flexGrow={1} flexDirection="column" justifyContent="center" alignItems="center">
            <text fg="#f7768e">Error: {activeData.error}</text>
            <text fg="#565f89">
              Press <span fg="#7aa2f7">r</span> to retry
            </text>
            <text fg="#565f89">
              Press <span fg="#7aa2f7">f</span> to refine query
            </text>
          </box>
        ) : activeData?.result ? (
          <box flexGrow={1} flexDirection="column">
            {/* FilterBar */}
            <FilterBar
              focused={filterBarFocused}
              dbType={dbType}
              currentFilter={activeData.filter || ""}
              currentSort={activeData.sort}
              onSortChange={handleSortChange}
              onExecute={handleFilterExecute}
              onClear={handleFilterClear}
              onUnfocus={() => setFilterBarFocused(false)}
            />
            {/* DataTable */}
            <DataTable
              result={activeData.result}
              focused={focused && !filterBarFocused}
              currentOffset={activeData.currentOffset}
              pageSize={activeData.pageSize}
              currentSort={activeData.sort}
              onPageChange={handlePageChange}
              onColumnSort={handleColumnSort}
              onCellSelect={handleCellSelect}
              sidebarWidth={sidebarWidth}
              filterBarActive={filterBarFocused}
            />
          </box>
        ) : (
          <box flexGrow={1} justifyContent="center" alignItems="center">
            <text fg="#565f89">Loading...</text>
          </box>
        )
      ) : (
        <box flexGrow={1} flexDirection="column" justifyContent="center" alignItems="center">
          <text fg="#565f89">Connect to a database to get started</text>
          <text fg="#414868">
            Press <span fg="#7aa2f7">1</span> to focus sidebar, then <span fg="#7aa2f7">a</span> to add a connection
          </text>
        </box>
      )}
    </box>
  )
}
