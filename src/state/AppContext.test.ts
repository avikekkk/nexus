import { expect, test } from "bun:test"

import type { ConnectionConfig, ConnectionState } from "../db/types.ts"
import { appReducer, type AppAction, type AppState } from "./AppContext.tsx"

function createConnection(config: ConnectionConfig, status: ConnectionState["status"], error?: string): ConnectionState {
  return { config, status, error }
}

function createState(connections: ConnectionState[], activeConnectionId: string | null): AppState {
  return {
    connections,
    activeConnectionId,
    treeExpanded: new Set<string>(),
    treeSelected: null,
    treeLoading: new Set<string>(),
    treeChildren: new Map(),
    treeVisibleCount: new Map(),
    treeNextCursor: new Map(),
    tabs: [],
    activeTabId: null,
    tabData: new Map(),
    consoleEntries: [],
    allDatabases: new Map(),
    visibleDatabases: new Map(),
    userSelectedDatabases: new Set(),
  }
}

test("UPDATE_CONNECTION resets connection state so Enter can reconnect", () => {
  const id = "conn-1"
  const initial = createState(
    [
      createConnection(
        {
          id,
          name: "Old",
          type: "mongo",
          host: "bad-host",
          port: 27017,
        },
        "connected"
      ),
    ],
    id
  )

  const action: AppAction = {
    type: "UPDATE_CONNECTION",
    id,
    config: {
      name: "Updated",
      type: "mongo",
      host: "localhost",
      port: 27017,
    },
  }

  const next = appReducer(initial, action)
  const updated = next.connections[0]

  expect(updated?.config.name).toBe("Updated")
  expect(updated?.config.host).toBe("localhost")
  expect(updated?.status).toBe("disconnected")
  expect(updated?.error).toBeUndefined()
  expect(next.activeConnectionId).toBeNull()
})
