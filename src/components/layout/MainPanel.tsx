import { useState, useEffect, useRef, useCallback, useMemo } from "react"
import { useKeyboard } from "@opentui/react"
import { useApp } from "../../state/AppContext.tsx"
import { DataTable, type SelectedCell } from "../main/DataTable.tsx"
import { FilterBar } from "../main/FilterBar.tsx"
import { QueryConsole } from "../main/QueryConsole.tsx"
import { DB_TYPE_ICONS, DB_TYPE_COLORS } from "../../constants/dbIcons.ts"
import { nodeId } from "../../state/tree.ts"

interface MainPanelProps {
  focused: boolean
  sidebarWidth: number
  detailWidth: number
  onOpenDetail: (tabId: string, cell: SelectedCell) => void
  onShowToast: (message: string) => void
  onQueryInputFocusChange?: (focused: boolean) => void
}

export function MainPanel({
  focused,
  sidebarWidth,
  detailWidth,
  onOpenDetail,
  onShowToast,
  onQueryInputFocusChange,
}: MainPanelProps) {
  const { state, dispatch, closeTab, nextTab, prevTab, fetchTabData, setTabFilter, setTabSort, getDriver } = useApp()
  const borderColor = focused ? "#7aa2f7" : "#414868"
  const { tabs, activeTabId, tabData, connections } = state
  const fetchedTabs = useRef(new Set<string>())
  const [filterBarFocused, setFilterBarFocused] = useState(false)
  const [queryInputFocused, setQueryInputFocused] = useState(true)
  const [querySchemaCollections, setQuerySchemaCollections] = useState<string[]>([])
  const querySchemaCacheRef = useRef(new Map<string, string[]>())

  const applyQuerySchemaCollections = useCallback((collections: string[]) => {
    setQuerySchemaCollections(collections)
  }, [])

  const activeTab = tabs.find((t) => t.id === activeTabId)
  const activeData = activeTabId ? tabData.get(activeTabId) : undefined
  const isQueryConsoleTab = activeTab?.kind === "query-console"
  const isQueryResultTab = activeTab?.kind === "query-result"
  const activeConnection = activeTab ? connections.find((c) => c.config.id === activeTab.connectionId) : undefined
  const dbType = activeConnection?.config.type ?? "mongo"

  const schemaDatabases = useMemo(() => {
    if (!activeTab) return []
    return state.allDatabases.get(activeTab.connectionId) ?? []
  }, [activeTab, state.allDatabases])

  const schemaCollectionsFromTree = useMemo(() => {
    if (!activeTab) return []
    const dbNode = nodeId(activeTab.connectionId, activeTab.database)
    const treeCollections = state.treeChildren.get(dbNode) ?? []
    return treeCollections.map((item) => item.label)
  }, [activeTab, state.treeChildren])

  const schemaCollectionFields = useMemo(() => {
    if (!activeTab) return {}

    const fields: Record<string, string[]> = {}
    for (const tab of tabs) {
      if (tab.connectionId !== activeTab.connectionId || tab.database !== activeTab.database || tab.kind !== "collection") {
        continue
      }

      const columns = tabData.get(tab.id)?.result?.columns.map((column) => column.name) ?? []
      if (columns.length === 0) continue

      const existing = fields[tab.collection] ?? []
      fields[tab.collection] = Array.from(new Set([...existing, ...columns]))
    }

    return fields
  }, [activeTab, tabs, tabData])

  useEffect(() => {
    if (activeTabId && !fetchedTabs.current.has(activeTabId)) {
      const tab = tabs.find((t) => t.id === activeTabId)
      if (tab?.kind === "query-console" || tab?.kind === "query-result") return

      const data = tabData.get(activeTabId)
      if (!data || (!data.result && !data.loading && !data.error)) {
        fetchedTabs.current.add(activeTabId)
        void fetchTabData(activeTabId)
      }
    }
  }, [activeTabId, fetchTabData, tabData, tabs])

  useEffect(() => {
    const hasMainTextInputFocus = (isQueryConsoleTab && queryInputFocused) || (!isQueryConsoleTab && filterBarFocused)
    onQueryInputFocusChange?.(hasMainTextInputFocus)
  }, [isQueryConsoleTab, queryInputFocused, filterBarFocused, onQueryInputFocusChange])

  useEffect(() => {
    if (!isQueryConsoleTab || !activeTab) {
      applyQuerySchemaCollections([])
      return
    }

    const cacheKey = `${activeTab.connectionId}/${activeTab.database}`

    if (schemaCollectionsFromTree.length > 0) {
      querySchemaCacheRef.current.set(cacheKey, schemaCollectionsFromTree)
      applyQuerySchemaCollections(schemaCollectionsFromTree)
      return
    }

    const cached = querySchemaCacheRef.current.get(cacheKey)
    if (cached && cached.length > 0) {
      applyQuerySchemaCollections(cached)
      return
    }

    const driver = getDriver(activeTab.connectionId)
    if (!driver) {
      applyQuerySchemaCollections([])
      return
    }

    let cancelled = false

    driver
      .listCollections(activeTab.database)
      .then((collections) => {
        if (cancelled) return
        const names = collections.map((collection) => collection.name)
        querySchemaCacheRef.current.set(cacheKey, names)
        applyQuerySchemaCollections(names)
      })
      .catch(() => {
        if (!cancelled) {
          applyQuerySchemaCollections([])
        }
      })

    return () => {
      cancelled = true
    }
  }, [activeTab, applyQuerySchemaCollections, getDriver, isQueryConsoleTab, schemaCollectionsFromTree])

  useKeyboard((key) => {
    if (!focused) return

    if (isQueryConsoleTab) {
      if (!queryInputFocused) {
        if (key.name === "]") {
          nextTab()
          return
        }
        if (key.name === "[") {
          prevTab()
          return
        }
        if (key.name === "return" || key.name === "enter") {
          setQueryInputFocused(true)
          return
        }
        if ((key.ctrl && key.name === "w") || key.name === "w") {
          if (activeTabId) {
            fetchedTabs.current.delete(activeTabId)
            closeTab(activeTabId)
          }
          return
        }
      }
      return
    }

    if ((key.name === "f" || key.name === "/") && activeTab && !filterBarFocused && !isQueryResultTab) {
      setFilterBarFocused(true)
      return
    }

    if (filterBarFocused) return

    if (key.name === "]") {
      nextTab()
      return
    }
    if (key.name === "[") {
      prevTab()
      return
    }

    if ((key.ctrl && key.name === "w") || key.name === "w") {
      if (activeTabId) {
        fetchedTabs.current.delete(activeTabId)
        closeTab(activeTabId)
      }
      return
    }

    if (key.name === "r") {
      if (activeTabId && !isQueryResultTab) {
        fetchedTabs.current.delete(activeTabId)
        void fetchTabData(activeTabId)
      }
      return
    }
  })

  const handlePageChange = useCallback(
    (offset: number) => {
      if (activeTabId && activeData && !isQueryResultTab) {
        void fetchTabData(activeTabId, offset, activeData.pageSize)
      }
    },
    [activeTabId, activeData, isQueryResultTab, fetchTabData]
  )

  const handleSortChange = useCallback(
    (sort: Record<string, 1 | -1> | null) => {
      if (activeTabId) {
        setTabSort(activeTabId, sort)
      }
    },
    [activeTabId, setTabSort]
  )

  const handleFilterExecute = useCallback(
    async (filter: string) => {
      if (!activeTabId || !activeTab) return

      setTabFilter(activeTabId, filter)
      fetchedTabs.current.delete(activeTabId)

      const result = await fetchTabData(activeTabId, 0, undefined, filter)
      if (!result) return

      if (result.rows.length === 0) {
        onShowToast("No data returned")
        return
      }

      if (activeTab.kind === "query-console") {
        const resultTabId = `${activeTab.connectionId}/${activeTab.database}/__query_result__/${Date.now()}`
        dispatch({
          type: "OPEN_TAB",
          tab: {
            id: resultTabId,
            label: `Query result [${activeTab.database}]`,
            connectionId: activeTab.connectionId,
            database: activeTab.database,
            collection: "__query_result__",
            kind: "query-result",
          },
        })
        dispatch({
          type: "SET_TAB_DATA",
          tabId: resultTabId,
          data: {
            result,
            loading: false,
            error: null,
            pageSize: 20,
            currentOffset: 0,
            filter,
            sort: null,
            customQuery: true,
          },
        })
        return
      }

      setFilterBarFocused(false)
    },
    [activeTabId, activeTab, dispatch, fetchTabData, onShowToast, setTabFilter]
  )

  const handleFilterClear = useCallback(() => {
    if (!activeTabId) return
    if (activeTab?.kind === "query-result") return

    setTabFilter(activeTabId, "")

    if (activeTab?.kind === "query-console") {
      return
    }

    setTabSort(activeTabId, null)
    fetchedTabs.current.delete(activeTabId)
    void fetchTabData(activeTabId, 0, undefined, "")
  }, [activeTabId, activeTab, setTabFilter, setTabSort, fetchTabData])

  const handleColumnSort = useCallback(
    (column: string, direction: 1 | -1) => {
      if (activeTabId && !isQueryResultTab) {
        setTabSort(activeTabId, { [column]: direction })
        fetchedTabs.current.delete(activeTabId)
        void fetchTabData(activeTabId, 0)
      }
    },
    [activeTabId, isQueryResultTab, setTabSort, fetchTabData]
  )

  const handleCellSelect = useCallback(
    (cell: SelectedCell) => {
      if (!activeTabId || isQueryConsoleTab) return
      onOpenDetail(activeTabId, cell)
    },
    [activeTabId, isQueryConsoleTab, onOpenDetail]
  )

  return (
    <box flexGrow={1} flexDirection="column" border borderStyle="rounded" borderColor={borderColor}>
      <box height={1} paddingX={1} flexDirection="row" gap={0}>
        {tabs.length === 0 ? (
          <text fg="#565f89">No tabs open</text>
        ) : (
          tabs.map((tab) => {
            const isActive = tab.id === activeTabId
            const connection = state.connections.find((c) => c.config.id === tab.connectionId)
            const dbTypeIcon = connection ? DB_TYPE_ICONS[connection.config.type] : ""
            const iconColor = connection ? DB_TYPE_COLORS[connection.config.type] : "#7aa2f7"
            const connectionName = connection?.config.name || ""
            const maxLabelLen = 24
            const label = tab.label.length > maxLabelLen ? tab.label.slice(0, maxLabelLen - 2) + "…" : tab.label

            if (isActive) {
              return (
                <text key={tab.id} bg="#292e42">
                  <span fg="#7aa2f7">▎</span>
                  <span fg={iconColor}>{dbTypeIcon}</span>
                  <span fg="#c0caf5"> {label} </span>
                  <span fg="#565f89">[{connectionName}]</span>
                  <span fg="#414868">▕</span>
                </text>
              )
            }

            return (
              <text key={tab.id}>
                <span fg="#292e42">▎</span>
                <span fg="#565f89">
                  {dbTypeIcon} {label} [{connectionName}]
                </span>
                <span fg="#292e42">▕</span>
              </text>
            )
          })
        )}
      </box>

      <box height={1} paddingX={0}>
        <text fg="#414868">{"─".repeat(200)}</text>
      </box>

      {activeTab ? (
        isQueryConsoleTab ? (
          <QueryConsole
            focused={focused && queryInputFocused}
            query={activeData?.filter || ""}
            error={activeData?.error}
            dbType={dbType}
            database={activeTab.database}
            schemaDatabases={schemaDatabases}
            schemaCollections={querySchemaCollections}
            schemaCollectionFields={schemaCollectionFields}
            onChange={(next) => setTabFilter(activeTab.id, next)}
            onExecute={handleFilterExecute}
            onBlur={() => setQueryInputFocused(false)}
          />
        ) : activeData?.loading ? (
          <box flexGrow={1} flexDirection="column" justifyContent="center" alignItems="center">
            <text fg="#e0af68">Loading {activeTab.database}.{activeTab.collection}...</text>
            <text fg="#565f89">Please wait while query executes</text>
          </box>
        ) : activeData?.error ? (
          <box flexGrow={1} flexDirection="column" justifyContent="center" alignItems="center">
            <text fg="#f7768e">Error: {activeData.error}</text>
            <text fg="#565f89">
              Press <span fg="#7aa2f7">r</span> to retry
            </text>
          </box>
        ) : activeData?.result ? (
          <box flexGrow={1} flexDirection="column">
            {!isQueryResultTab && (
              <FilterBar
                focused={filterBarFocused}
                dbType={dbType}
                database={activeTab.database}
                collection={activeTab.collection}
                schemaDatabases={schemaDatabases}
                schemaCollections={schemaCollectionsFromTree}
                schemaCollectionFields={schemaCollectionFields}
                currentFilter={activeData.filter || ""}
                currentSort={activeData.sort}
                onSortChange={handleSortChange}
                onExecute={handleFilterExecute}
                onClear={handleFilterClear}
                onUnfocus={() => setFilterBarFocused(false)}
              />
            )}
            <DataTable
              result={activeData.result}
              focused={focused && !filterBarFocused}
              currentOffset={activeData.currentOffset}
              pageSize={activeData.pageSize}
              currentSort={activeData.sort}
              onPageChange={isQueryResultTab ? undefined : handlePageChange}
              onColumnSort={isQueryResultTab ? undefined : handleColumnSort}
              onCellSelect={handleCellSelect}
              sidebarWidth={sidebarWidth}
              detailWidth={detailWidth}
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
