import { describe, expect, test } from "bun:test"
import { parseEditedValue, stringifyValue, getTypeName } from "../../src/utils/detailValue.ts"

describe("detailValue utils", () => {
  test("parseEditedValue parses numbers", () => {
    const result = parseEditedValue("mongo", "42", 0)
    expect(result.error).toBeUndefined()
    expect(result.value).toBe(42)
  })

  test("parseEditedValue parses booleans", () => {
    expect(parseEditedValue("mongo", "true", false).value).toBe(true)
    expect(parseEditedValue("mongo", "false", true).value).toBe(false)
    expect(parseEditedValue("mongo", "x", true).error).toBe("Expected true or false")
  })

  test("parseEditedValue validates JSON for objects", () => {
    const ok = parseEditedValue("mongo", '{"a":1}', { a: 0 })
    expect(ok.error).toBeUndefined()
    expect(ok.value).toEqual({ a: 1 })

    const bad = parseEditedValue("mongo", "{", { a: 0 })
    expect(bad.error).toBe("Invalid JSON")
  })

  test("redis string keeps raw input", () => {
    const result = parseEditedValue("redis", "hello", "old")
    expect(result.error).toBeUndefined()
    expect(result.value).toBe("hello")
  })

  test("stringifyValue and getTypeName", () => {
    expect(stringifyValue(null)).toBe("null")
    expect(stringifyValue({ icon: "🤖" })).toContain("\\ud83e\\udd16")
    expect(getTypeName([1, 2])).toBe("array")
    expect(getTypeName({})).toBe("object")
  })
})
