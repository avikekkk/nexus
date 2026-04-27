interface KeyLike {
  name?: string
  sequence?: string
  ctrl?: boolean
  meta?: boolean
  alt?: boolean
  shift?: boolean
}

interface TextInputOptions {
  allowNewline?: boolean
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

function stripBracketedPaste(sequence: string): string {
  const start = "\u001b[200~"
  const end = "\u001b[201~"
  if (sequence.startsWith(start) && sequence.endsWith(end)) {
    return sequence.slice(start.length, sequence.length - end.length)
  }
  return sequence
}

export function normalizeTextInput(text: string, options: TextInputOptions = {}): string {
  const allowNewline = !!options.allowNewline
  const normalized = stripBracketedPaste(text).replace(/\r\n?/g, "\n")

  if (normalized.includes("\u001b")) {
    return ""
  }

  return allowNewline
    ? normalized.replace(/[\x00-\x09\x0B-\x1F\x7F]/g, "")
    : normalized.replace(/[\x00-\x1F\x7F]/g, "")
}

export function getTextInput(key: KeyLike, options: TextInputOptions = {}): string | null {
  if (key.ctrl || key.meta || key.alt) return null
  if (!key.sequence) return null

  const sanitized = normalizeTextInput(key.sequence, options)
  return sanitized.length > 0 ? sanitized : null
}

export function getPrintableKey(key: KeyLike): string | null {
  const text = getTextInput(key)
  return text && text.length === 1 ? text : null
}

function isWordChar(char: string): boolean {
  return /[a-zA-Z0-9_]/.test(char)
}

export function moveCursorWordLeft(input: string, cursor: number): number {
  if (!input || cursor <= 0) return 0

  let pos = cursor

  while (pos > 0 && /\s/.test(input[pos - 1] ?? "")) {
    pos -= 1
  }

  if (pos > 0 && isWordChar(input[pos - 1] ?? "")) {
    while (pos > 0 && isWordChar(input[pos - 1] ?? "")) {
      pos -= 1
    }
    return pos
  }

  while (pos > 0 && !/\s/.test(input[pos - 1] ?? "") && !isWordChar(input[pos - 1] ?? "")) {
    pos -= 1
  }

  return pos
}

export function moveCursorWordRight(input: string, cursor: number): number {
  if (!input || cursor >= input.length) return input.length

  let pos = cursor

  while (pos < input.length && /\s/.test(input[pos] ?? "")) {
    pos += 1
  }

  if (pos < input.length && isWordChar(input[pos] ?? "")) {
    while (pos < input.length && isWordChar(input[pos] ?? "")) {
      pos += 1
    }
    return pos
  }

  while (pos < input.length && !/\s/.test(input[pos] ?? "") && !isWordChar(input[pos] ?? "")) {
    pos += 1
  }

  return pos
}

export function deleteWordBackward(input: string, cursor: number): { value: string; cursor: number } {
  if (!input || cursor <= 0) {
    return { value: input, cursor }
  }

  const start = moveCursorWordLeft(input, cursor)

  return {
    value: input.slice(0, start) + input.slice(cursor),
    cursor: start,
  }
}
