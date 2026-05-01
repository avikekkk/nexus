import { describe, expect, test } from "bun:test"
import { insertWithAutoPair } from "../../../src/query/editor/autoPair.ts"

describe("insertWithAutoPair", () => {
  test("keeps quote autopair in empty context", () => {
    const result = insertWithAutoPair("", 0, '"')
    expect(result.value).toBe('""')
    expect(result.cursor).toBe(1)
    expect(result.handled).toBe(true)
  })

  test("does not auto-pair quote before identifier", () => {
    const result = insertWithAutoPair("_id", 0, '"')
    expect(result.value).toBe('"_id')
    expect(result.cursor).toBe(1)
    expect(result.handled).toBe(false)
  })

  test("does not auto-pair quote after identifier", () => {
    const result = insertWithAutoPair("_id", 3, '"')
    expect(result.value).toBe('_id"')
    expect(result.cursor).toBe(4)
    expect(result.handled).toBe(false)
  })
})
