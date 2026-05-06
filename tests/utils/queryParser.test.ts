import { describe, expect, test } from "bun:test"
import { ObjectId } from "mongodb"
import { parseMongoExtendedJson, parseMongoFilter } from "../../src/utils/queryParser.ts"

describe("parseMongoFilter", () => {
  test("parses ObjectId shell literal in filter", () => {
    const result = parseMongoFilter('{"_id": ObjectId("59b99db5cfa9a34dcd7885b8")}')

    expect(result.error).toBeNull()
    expect(result.filter).not.toBeNull()

    const id = result.filter?._id
    expect(id instanceof ObjectId).toBe(true)
    expect((id as ObjectId).toHexString()).toBe("59b99db5cfa9a34dcd7885b8")
  })

  test("accepts unquoted top-level keys", () => {
    const result = parseMongoFilter('{ _id: ObjectId("59b99db5cfa9a34dcd7885b8"), status: "active" }')

    expect(result.error).toBeNull()
    expect(result.filter).not.toBeNull()
    expect(result.filter?.status).toBe("active")
    expect(result.filter?._id instanceof ObjectId).toBe(true)
  })

  test("accepts unquoted nested keys and operators", () => {
    const result = parseMongoFilter('{ age: { $gte: 18 }, profile: { isActive: true } }')

    expect(result.error).toBeNull()
    expect(result.filter).toEqual({
      age: { $gte: 18 },
      profile: { isActive: true },
    })
  })

  test("accepts single-quoted strings", () => {
    const result = parseMongoFilter("{ status: 'active', profile: { name: 'alice' } }")

    expect(result.error).toBeNull()
    expect(result.filter).toEqual({
      status: "active",
      profile: { name: "alice" },
    })
  })

  test("accepts trailing commas", () => {
    const result = parseMongoFilter('{ status: "active", tags: ["a", "b",], }')

    expect(result.error).toBeNull()
    expect(result.filter).toEqual({
      status: "active",
      tags: ["a", "b"],
    })
  })

  test("accepts new Date(Date.now() - expression)", () => {
    const before = Date.now()
    const result = parseMongoFilter('{ createdAt: { $gte: new Date(Date.now() - 5*24*60*60*1000) } }')

    expect(result.error).toBeNull()
    const createdAt = result.filter?.createdAt as Record<string, unknown> | undefined
    const gte = createdAt?.$gte
    expect(gte instanceof Date).toBe(true)

    const fiveDays = 5 * 24 * 60 * 60 * 1000
    const timestamp = (gte as Date).getTime()
    expect(timestamp).toBeGreaterThanOrEqual(before - fiveDays - 5000)
    expect(timestamp).toBeLessThanOrEqual(Date.now() - fiveDays + 5000)
  })

  test("parses db.collection style projection keys", () => {
    const parsed = parseMongoExtendedJson("{ 'items.type': 1, total: 1 }") as Record<string, unknown>
    expect(parsed["items.type"]).toBe(1)
    expect(parsed.total).toBe(1)
  })

  test("accepts regex literals in filters", () => {
    const result = parseMongoFilter(`{
      role: { $in: [ /^\\s*admin\\s*$/i, /^\\s*cre\\s*$/i ] },
      softdelete: { $ne: true },
      organization_id: "660269f0cb0a8b001bacf21a"
    }`)

    expect(result.error).toBeNull()
    const role = result.filter?.role as Record<string, unknown> | undefined
    const values = role?.$in as unknown[] | undefined
    expect(values?.[0] instanceof RegExp).toBe(true)
    expect(values?.[1] instanceof RegExp).toBe(true)
    expect((values?.[0] as RegExp).source).toBe("^\\s*admin\\s*$")
    expect((values?.[0] as RegExp).flags).toBe("i")
  })

  test("does not treat slashes inside strings as regex literals", () => {
    const result = parseMongoFilter('{ path: "/api/users", role: /^admin$/i }')

    expect(result.error).toBeNull()
    expect(result.filter?.path).toBe("/api/users")
    expect(result.filter?.role instanceof RegExp).toBe(true)
  })

  test("rejects invalid ObjectId shell literal", () => {
    const result = parseMongoFilter('{"_id": ObjectId("invalid") }')
    expect(result.error).not.toBeNull()
  })
})
