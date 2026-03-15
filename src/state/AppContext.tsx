import { createContext, useContext, useReducer, useEffect, useCallback, type ReactNode } from "react"
import type { ConnectionConfig, ConnectionState, ConnectionStatus, DbDriver } from "../db/types.ts"
import { createDriver } from "../db/registry.ts"
import { loadConnections, saveConnections, generateId } from "./connections.ts"
import { nodeId, type TreeNode } from "./tree.ts"

export interface Tab {
  id: string
  label: string
  connectionId: string
  database: string
  collection: string
}

interface AppState {
  connections: ConnectionState[]
  activeConnectionId: string | null
  treeExpanded: Set<string>
  treeSelected: string | null
  treeLoading: Set<string>
  treeChildren: Map<string, TreeNode[]>
  tabs: Tab[]
  activeTabId: string | null
}

type AppAction =
  | { type: "SET_CONNECTIONS"; configs: ConnectionConfig[] }
  | { type: "ADD_CONNECTION"; config: ConnectionConfig }
  | { type: "REMOVE_CONNECTION"; id: string }
  | { type: "SET_STATUS"; id: string; status: ConnectionStatus; error?: string }
  | { type: "SET_ACTIVE"; id: string | null }
  | { type: "TREE_TOGGLE_EXPAND"; nodeId: string }
  | { type: "TREE_SET_SELECTED"; nodeId: string | null }
  | { type: "TREE_SET_LOADING"; nodeId: string; loading: boolean }
  | { type: "TREE_SET_CHILDREN"; nodeId: string; children: TreeNode[] }
  | { type: "TREE_CLEAR_CONNECTION"; connectionId: string }
  | { type: "OPEN_TAB"; tab: Tab }
  | { type: "CLOSE_TAB"; tabId: string }
  | { type: "SET_ACTIVE_TAB"; tabId: string }

interface AppContextValue {
  state: AppState
  dispatch: React.Dispatch<AppAction>
  connectTo: (id: string) => Promise<void>
  disconnectFrom: (id: string) => Promise<void>
  addConnection: (config: Omit<ConnectionConfig, "id">) => void
  removeConnection: (id: string) => void
  getDriver: (id: string) => DbDriver | undefined
  toggleExpand: (nid: string, connectionId: string, database?: string) => void
  selectNode: (nid: string | null) => void
  openCollection: (connectionId: string, database: string, collection: string) => void
}

function cloneSet<T>(s: Set<T>): Set<T> {
  return new Set(s)
}

function cloneMap<K, V>(m: Map<K, V>): Map<K, V> {
  return new Map(m)
}

function reducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case "SET_CONNECTIONS":
      return {
        ...state,
        connections: action.configs.map((config) => ({
          config,
          status: "disconnected" as const,
        })),
      }
    case "ADD_CONNECTION":
      return {
        ...state,
        connections: [...state.connections, { config: action.config, status: "disconnected" }],
      }
    case "REMOVE_CONNECTION":
      return {
        ...state,
        connections: state.connections.filter((c) => c.config.id !== action.id),
        activeConnectionId: state.activeConnectionId === action.id ? null : state.activeConnectionId,
      }
    case "SET_STATUS":
      return {
        ...state,
        connections: state.connections.map((c) =>
          c.config.id === action.id ? { ...c, status: action.status, error: action.error } : c
        ),
      }
    case "SET_ACTIVE":
      return { ...state, activeConnectionId: action.id }

    case "TREE_TOGGLE_EXPAND": {
      const expanded = cloneSet(state.treeExpanded)
      if (expanded.has(action.nodeId)) {
        expanded.delete(action.nodeId)
      } else {
        expanded.add(action.nodeId)
      }
      return { ...state, treeExpanded: expanded }
    }
    case "TREE_SET_SELECTED":
      return { ...state, treeSelected: action.nodeId }
    case "TREE_SET_LOADING": {
      const loading = cloneSet(state.treeLoading)
      if (action.loading) {
        loading.add(action.nodeId)
      } else {
        loading.delete(action.nodeId)
      }
      return { ...state, treeLoading: loading }
    }
    case "TREE_SET_CHILDREN": {
      const children = cloneMap(state.treeChildren)
      children.set(action.nodeId, action.children)
      return { ...state, treeChildren: children }
    }
    case "TREE_CLEAR_CONNECTION": {
      const expanded = cloneSet(state.treeExpanded)
      const loading = cloneSet(state.treeLoading)
      const children = cloneMap(state.treeChildren)
      for (const key of expanded) {
        if (key.startsWith(action.connectionId)) expanded.delete(key)
      }
      for (const key of loading) {
        if (key.startsWith(action.connectionId)) loading.delete(key)
      }
      for (const key of children.keys()) {
        if (key.startsWith(action.connectionId)) children.delete(key)
      }
      return { ...state, treeExpanded: expanded, treeLoading: loading, treeChildren: children }
    }

    case "OPEN_TAB": {
      const exists = state.tabs.find((t) => t.id === action.tab.id)
      if (exists) {
        return { ...state, activeTabId: action.tab.id }
      }
      return { ...state, tabs: [...state.tabs, action.tab], activeTabId: action.tab.id }
    }
    case "CLOSE_TAB": {
      const tabs = state.tabs.filter((t) => t.id !== action.tabId)
      const activeTabId =
        state.activeTabId === action.tabId ? (tabs.length > 0 ? tabs[tabs.length - 1]!.id : null) : state.activeTabId
      return { ...state, tabs, activeTabId }
    }
    case "SET_ACTIVE_TAB":
      return { ...state, activeTabId: action.tabId }
  }
}

const AppContext = createContext<AppContextValue | null>(null)

const driverMap = new Map<string, DbDriver>()

export function AppProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, {
    connections: [],
    activeConnectionId: null,
    treeExpanded: new Set<string>(),
    treeSelected: null,
    treeLoading: new Set<string>(),
    treeChildren: new Map<string, TreeNode[]>(),
    tabs: [],
    activeTabId: null,
  })

  useEffect(() => {
    loadConnections().then((configs) => {
      if (configs.length > 0) {
        dispatch({ type: "SET_CONNECTIONS", configs })
      }
    })
  }, [])

  useEffect(() => {
    if (state.connections.length > 0) {
      saveConnections(state.connections.map((c) => c.config))
    }
  }, [state.connections])

  const connectTo = async (id: string) => {
    const conn = state.connections.find((c) => c.config.id === id)
    if (!conn) return

    dispatch({ type: "SET_STATUS", id, status: "connecting" })
    try {
      const driver = createDriver(conn.config.type)
      await driver.connect(conn.config)
      driverMap.set(id, driver)
      dispatch({ type: "SET_STATUS", id, status: "connected" })
      dispatch({ type: "SET_ACTIVE", id })
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      dispatch({ type: "SET_STATUS", id, status: "error", error: msg })
    }
  }

  const disconnectFrom = async (id: string) => {
    const driver = driverMap.get(id)
    if (driver) {
      try {
        await driver.disconnect()
      } catch {
        // best effort
      }
      driverMap.delete(id)
    }
    dispatch({ type: "SET_STATUS", id, status: "disconnected" })
    dispatch({ type: "TREE_CLEAR_CONNECTION", connectionId: id })
    if (state.activeConnectionId === id) {
      dispatch({ type: "SET_ACTIVE", id: null })
    }
  }

  const addConnection = (config: Omit<ConnectionConfig, "id">) => {
    const full: ConnectionConfig = { ...config, id: generateId() }
    dispatch({ type: "ADD_CONNECTION", config: full })
  }

  const removeConnection = (id: string) => {
    const driver = driverMap.get(id)
    if (driver) {
      driver.disconnect().catch(() => {})
      driverMap.delete(id)
    }
    dispatch({ type: "TREE_CLEAR_CONNECTION", connectionId: id })
    dispatch({ type: "REMOVE_CONNECTION", id })
  }

  const getDriver = (id: string) => driverMap.get(id)

  const toggleExpand = useCallback(
    (nid: string, connectionId: string, database?: string) => {
      const isExpanded = state.treeExpanded.has(nid)
      dispatch({ type: "TREE_TOGGLE_EXPAND", nodeId: nid })

      // If expanding and we don't have children cached, fetch them
      if (!isExpanded && !state.treeChildren.has(nid)) {
        const driver = driverMap.get(connectionId)
        if (!driver) return

        dispatch({ type: "TREE_SET_LOADING", nodeId: nid, loading: true })

        if (!database) {
          // Fetch databases
          driver
            .listDatabases()
            .then((dbs) => {
              const nodes: TreeNode[] = dbs.map((db) => ({
                id: nodeId(connectionId, db),
                label: db,
                type: "database" as const,
                connectionId,
                database: db,
              }))
              dispatch({ type: "TREE_SET_CHILDREN", nodeId: nid, children: nodes })
            })
            .catch(() => {
              dispatch({ type: "TREE_SET_CHILDREN", nodeId: nid, children: [] })
            })
            .finally(() => {
              dispatch({ type: "TREE_SET_LOADING", nodeId: nid, loading: false })
            })
        } else {
          // Fetch collections for a database
          driver
            .listCollections(database)
            .then((cols) => {
              const nodes: TreeNode[] = cols.map((col) => ({
                id: nodeId(connectionId, database, col.name),
                label: col.name,
                type: "collection" as const,
                connectionId,
                database,
                collection: col.name,
                count: col.count,
              }))
              dispatch({ type: "TREE_SET_CHILDREN", nodeId: nid, children: nodes })
            })
            .catch(() => {
              dispatch({ type: "TREE_SET_CHILDREN", nodeId: nid, children: [] })
            })
            .finally(() => {
              dispatch({ type: "TREE_SET_LOADING", nodeId: nid, loading: false })
            })
        }
      }
    },
    [state.treeExpanded, state.treeChildren]
  )

  const selectNode = useCallback((nid: string | null) => {
    dispatch({ type: "TREE_SET_SELECTED", nodeId: nid })
  }, [])

  const openCollection = useCallback(
    (connectionId: string, database: string, collection: string) => {
      const tabId = `${connectionId}/${database}/${collection}`
      const tab: Tab = {
        id: tabId,
        label: collection,
        connectionId,
        database,
        collection,
      }
      dispatch({ type: "OPEN_TAB", tab })
    },
    []
  )

  return (
    <AppContext.Provider
      value={{
        state,
        dispatch,
        connectTo,
        disconnectFrom,
        addConnection,
        removeConnection,
        getDriver,
        toggleExpand,
        selectNode,
        openCollection,
      }}
    >
      {children}
    </AppContext.Provider>
  )
}

export function useApp(): AppContextValue {
  const ctx = useContext(AppContext)
  if (!ctx) throw new Error("useApp must be used within AppProvider")
  return ctx
}
