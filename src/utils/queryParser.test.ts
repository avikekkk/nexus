import { describe, expect, test } from "bun:test"
import { ObjectId } from "mongodb"
import { parseMongoFilter } from "./queryParser.ts"

describe("parseMongoFilter", () => {
  test("parses ObjectId shell literal in filter", () => {
    const result = parseMongoFilter('{"_id": ObjectId("59b99db5cfa9a34dcd7885b8")}')

    expect(result.error).toBeNull()
    expect(result.filter).not.toBeNull()

    const id = result.filter?._id
    expect(id instanceof ObjectId).toBe(true)
    expect((id as ObjectId).toHexString()).toBe("59b99db5cfa9a34dcd7885b8")
  })

  test("rejects invalid ObjectId shell literal", () => {
    const result = parseMongoFilter('{"_id": ObjectId("invalid") }')
    expect(result.error).not.toBeNull()
  })
})
