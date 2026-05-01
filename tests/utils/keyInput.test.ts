import { describe, expect, test } from "bun:test"
import {
  deleteWordBackward,
  getPrintableKey,
  getTextInput,
  normalizeTextInput,
  isDeleteWordKey,
  isInsertNewlineKey,
  isShiftEnterKey,
  isSubmitKey,
  moveCursorWordLeft,
  moveCursorWordRight,
} from "../../src/utils/keyInput.ts"

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

  test("getPrintableKey ignores modifiers and control characters", () => {
    expect(getPrintableKey({ sequence: "a" })).toBe("a")
    expect(getPrintableKey({ sequence: "\t" })).toBeNull()
    expect(getPrintableKey({ sequence: "a", ctrl: true })).toBeNull()
    expect(getPrintableKey({ sequence: "a", meta: true })).toBeNull()
    expect(getPrintableKey({ sequence: "a", alt: true })).toBeNull()
  })

  test("getTextInput handles bracketed paste payload", () => {
    const seq = "\u001b[200~first\nsecond\u001b[201~"
    expect(getTextInput({ sequence: seq })).toBe("firstsecond")
    expect(getTextInput({ sequence: seq }, { allowNewline: true })).toBe("first\nsecond")
  })

  test("normalizeTextInput drops escape-heavy payload", () => {
    expect(normalizeTextInput("\u001b[31mred\u001b[0m")).toBe("")
  })

  test("deleteWordBackward trims current word and spaces", () => {
    const result = deleteWordBackward("alpha beta", "alpha beta".length)
    expect(result.value).toBe("alpha ")
    expect(result.cursor).toBe("alpha ".length)
  })

  test("moveCursorWordLeft jumps to previous word boundary", () => {
    const value = "alpha beta.gamma"
    expect(moveCursorWordLeft(value, value.length)).toBe("alpha beta.".length)
    expect(moveCursorWordLeft(value, "alpha beta.".length)).toBe("alpha beta".length)
    expect(moveCursorWordLeft(value, "alpha beta".length)).toBe("alpha ".length)
  })

  test("moveCursorWordRight jumps to next word boundary", () => {
    const value = "alpha beta.gamma"
    expect(moveCursorWordRight(value, 0)).toBe("alpha".length)
    expect(moveCursorWordRight(value, "alpha ".length)).toBe("alpha beta".length)
  })
})
