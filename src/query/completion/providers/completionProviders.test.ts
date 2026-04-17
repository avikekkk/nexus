import { describe, expect, test } from "bun:test"
import { mongoCompletionProvider } from "./mongo.ts"
import { mysqlCompletionProvider } from "./mysql.ts"
import { rankCompletionSuggestions } from "../ranking.ts"
import type { CompletionContext, CompletionSuggestion } from "../types.ts"

function baseContext(overrides: Partial<CompletionContext>): CompletionContext {
  return {
    query: "",
    cursor: 0,
    dbType: "mongo",
    database: "app",
    schema: {
      databases: ["app"],
      collections: ["users", "orders"],
      collectionFields: {
        users: ["name", "email", "age"],
        orders: ["status", "total"],
      },
    },
    ...overrides,
  }
}

describe("mongo completion", () => {
  test("suggests collection field names inside find filter object", () => {
    const query = "db.users.find({na"
    const result = mongoCompletionProvider.getCompletions(baseContext({ query, cursor: query.length, dbType: "mongo" }))

    expect(result).not.toBeNull()
    expect(result?.items[0]?.label).toBe("name")
    expect(result?.items[0]?.kind).toBe("field")
  })

  test("suggests ObjectId snippet for _id filter values", () => {
    const query = "db.users.find({_id: Obj"
    const result = mongoCompletionProvider.getCompletions(baseContext({ query, cursor: query.length, dbType: "mongo" }))

    expect(result).not.toBeNull()
    expect(result?.items[0]?.label).toBe("ObjectId(\"...\")")
  })

  test("does not suggest field names while typing a value", () => {
    const query = 'db.users.find({name: "al"})'
    const result = mongoCompletionProvider.getCompletions(baseContext({ query, cursor: query.indexOf("al") + 2, dbType: "mongo" }))

    expect(result).toBeNull()
  })
})

describe("mysql completion", () => {
  test("suggests tables after FROM", () => {
    const query = "SELECT * FROM us"
    const result = mysqlCompletionProvider.getCompletions(baseContext({ query, cursor: query.length, dbType: "mysql" }))

    expect(result).not.toBeNull()
    expect(result?.items[0]?.label).toBe("users")
  })

  test("suggests table columns in WHERE clause", () => {
    const query = "SELECT * FROM users WHERE na"
    const result = mysqlCompletionProvider.getCompletions(baseContext({ query, cursor: query.length, dbType: "mysql" }))

    expect(result).not.toBeNull()
    expect(result?.items.some((item) => item.label === "name")).toBe(true)
    expect(result?.items.find((item) => item.label === "name")?.kind).toBe("field")
  })

  test("suggests qualified columns after alias dot", () => {
    const query = "SELECT * FROM users u WHERE u.na"
    const result = mysqlCompletionProvider.getCompletions(baseContext({ query, cursor: query.length, dbType: "mysql" }))

    expect(result).not.toBeNull()
    expect(result?.items[0]?.label).toBe("name")
  })
})

describe("completion ranking", () => {
  test("prefers exact and prefix matches before fuzzy matches", () => {
    const items: CompletionSuggestion[] = [
      { id: "1", label: "name", kind: "field", insertText: "name" },
      { id: "2", label: "full_name", kind: "field", insertText: "full_name" },
      { id: "3", label: "username", kind: "field", insertText: "username" },
    ]

    const ranked = rankCompletionSuggestions(items, "name")
    expect(ranked[0]?.label).toBe("name")
    expect(ranked[1]?.label).toBe("username")
  })
})
