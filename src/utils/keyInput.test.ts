import { describe, expect, test } from "bun:test"
import { deleteWordBackward, getPrintableKey, isDeleteWordKey, isInsertNewlineKey, isShiftEnterKey, isSubmitKey } from "./keyInput.ts"

describe("keyInput utils", () => {
  test("isSubmitKey supports return and enter", () => {
    expect(isSubmitKey({ name: "return" })).toBe(true)
    expect(isSubmitKey({ name: "enter" })).toBe(true)
    expect(isSubmitKey({ name: "space" })).toBe(false)
  })

  test("isShiftEnterKey only for shifted submit", () => {
    expect(isShiftEnterKey({ name: "return", shift: true })).toBe(true)
    expect(isShiftEnterKey({ name: "enter", shift: true })).toBe(true)
    expect(isShiftEnterKey({ name: "return", shift: false })).toBe(false)
  })

  test("isInsertNewlineKey supports Ctrl+Enter", () => {
    expect(isInsertNewlineKey({ name: "return", ctrl: true })).toBe(true)
    expect(isInsertNewlineKey({ name: "enter", ctrl: true })).toBe(true)
    expect(isInsertNewlineKey({ name: "return", shift: true })).toBe(false)
    expect(isInsertNewlineKey({ name: "return", ctrl: false })).toBe(false)
  })

  test("isDeleteWordKey maps ctrl+backspace and ctrl+w", () => {
    expect(isDeleteWordKey({ name: "backspace", ctrl: true })).toBe(true)
    expect(isDeleteWordKey({ name: "w", ctrl: true })).toBe(true)
    expect(isDeleteWordKey({ name: "backspace", ctrl: false })).toBe(false)
  })

  test("getPrintableKey ignores modifiers", () => {
    expect(getPrintableKey({ sequence: "a" })).toBe("a")
    expect(getPrintableKey({ sequence: "a", ctrl: true })).toBeNull()
    expect(getPrintableKey({ sequence: "a", meta: true })).toBeNull()
    expect(getPrintableKey({ sequence: "a", alt: true })).toBeNull()
  })

  test("deleteWordBackward trims current word and spaces", () => {
    const result = deleteWordBackward("alpha beta", "alpha beta".length)
    expect(result.value).toBe("alpha ")
    expect(result.cursor).toBe("alpha ".length)
  })
})
