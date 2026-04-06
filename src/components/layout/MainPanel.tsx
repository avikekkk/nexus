import { useEffect, useRef, useCallback } from "react"
import { useKeyboard } from "@opentui/react"
import { useApp } from "../../state/AppContext.tsx"
import { DataTable } from "../main/DataTable.tsx"
import { DB_TYPE_ICONS, DB_TYPE_COLORS } from "../../constants/dbIcons.ts"

interface MainPanelProps {
  focused: boolean
  sidebarWidth: number
}

export function MainPanel({ focused, sidebarWidth }: MainPanelProps) {
  const { state, closeTab, nextTab, prevTab, fetchTabData } = useApp()
  const borderColor = focused ? "#7aa2f7" : "#414868"
  const { tabs, activeTabId, tabData } = state
  const fetchedTabs = useRef(new Set<string>())

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

  const handlePageChange = useCallback(
    (offset: number) => {
      if (activeTabId && activeData) {
        fetchTabData(activeTabId, offset, activeData.pageSize)
      }
    },
    [activeTabId, activeData, fetchTabData]
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
            const collectionLabel = tab.label
            const fullLabel = `${dbTypeIcon} ${collectionLabel} [${connectionName}]`
            
            const maxTabLen = 40
            const displayLabel = fullLabel.length > maxTabLen ? fullLabel.slice(0, maxTabLen - 1) + "…" : fullLabel
            
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
          <box flexGrow={1} justifyContent="center" alignItems="center">
            <text fg="#e0af68">
              Loading {activeTab.database}.{activeTab.collection}...
            </text>
          </box>
        ) : activeData?.error ? (
          <box flexGrow={1} flexDirection="column" justifyContent="center" alignItems="center">
            <text fg="#f7768e">Error: {activeData.error}</text>
            <text fg="#565f89">
              Press <span fg="#7aa2f7">r</span> to retry
            </text>
          </box>
        ) : activeData?.result ? (
          <DataTable
            result={activeData.result}
            focused={focused}
            currentOffset={activeData.currentOffset}
            pageSize={activeData.pageSize}
            onPageChange={handlePageChange}
            sidebarWidth={sidebarWidth}
          />
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
