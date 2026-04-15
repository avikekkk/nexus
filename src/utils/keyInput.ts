interface KeyLike {
  name?: string
  sequence?: string
  ctrl?: boolean
  meta?: boolean
  alt?: boolean
  shift?: boolean
}

export function isSubmitKey(key: KeyLike): boolean {
  return key.name === "return" || key.name === "enter"
}

export function isShiftEnterKey(key: KeyLike): boolean {
  return isSubmitKey(key) && !!key.shift
}

export function isInsertNewlineKey(key: KeyLike): boolean {
  return !!key.ctrl && isSubmitKey(key)
}

export function isDeleteWordKey(key: KeyLike): boolean {
  return !!key.ctrl && (key.name === "backspace" || key.name === "w")
}

export function getPrintableKey(key: KeyLike): string | null {
  if (!key.sequence || key.sequence.length !== 1) return null
  if (key.ctrl || key.meta || key.alt) return null
  return key.sequence
}

export function deleteWordBackward(input: string, cursor: number): { value: string; cursor: number } {
  if (!input || cursor <= 0) {
    return { value: input, cursor }
  }

  let start = cursor

  while (start > 0 && /\s/.test(input[start - 1] ?? "")) {
    start -= 1
  }

  while (start > 0 && /[a-zA-Z0-9_]/.test(input[start - 1] ?? "")) {
    start -= 1
  }

  if (start === cursor && start > 0) {
    start -= 1
  }

  return {
    value: input.slice(0, start) + input.slice(cursor),
    cursor: start,
  }
}
