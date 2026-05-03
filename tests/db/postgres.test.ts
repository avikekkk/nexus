import { EventEmitter } from "node:events"
import { afterEach, expect, mock, test } from "bun:test"

const clients: MockPostgresClient[] = []

class MockPostgresClient extends EventEmitter {
  readonly config: unknown
  readonly connect = mock(async () => {})
  readonly end = mock(async () => {
    this.emit("end")
  })
  readonly query = mock(async () => ({
    rows: [{ datname: "postgres" }],
    fields: [],
  }))

  constructor(config: unknown) {
    super()
    this.config = config
    clients.push(this)
  }
}

mock.module("pg", () => ({
  Client: MockPostgresClient,
}))

afterEach(() => {
  clients.length = 0
  mock.clearAllMocks()
})

test("postgres driver evicts dead clients and reconnects on the next operation", async () => {
  const { createPostgresDriver } = await import("../../src/db/postgres.ts")
  const driver = createPostgresDriver()

  await driver.connect({
    id: "pg-1",
    name: "Postgres",
    type: "postgres",
    host: "localhost",
    port: 5432,
    database: "postgres",
  })

  expect(clients).toHaveLength(1)
  expect(driver.isConnected()).toBe(true)

  expect(() => {
    clients[0]?.emit("error", new Error("terminating connection due to administrator command"))
    clients[0]?.emit("error", new Error("Connection terminated unexpectedly"))
  }).not.toThrow()

  expect(driver.isConnected()).toBe(false)

  const databases = await driver.listDatabases()

  expect(databases).toEqual(["postgres"])
  expect(clients).toHaveLength(2)
  expect(clients[1]?.connect).toHaveBeenCalledTimes(1)
  expect(clients[1]?.query).toHaveBeenCalledTimes(1)

  await driver.disconnect()
})
