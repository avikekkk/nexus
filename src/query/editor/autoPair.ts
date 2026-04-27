interface AutoPairResult {
  value: string
  cursor: number
  handled: boolean
}

const OPEN_TO_CLOSE: Record<string, string> = {
  "(": ")",
  "[": "]",
  "{": "}",
  "\"": "\"",
  "'": "'",
}

function isWordChar(char: string): boolean {
  return /[A-Za-z0-9_$]/.test(char)
}

function shouldAutoPairQuote(input: string, cursor: number): boolean {
  const prev = input[cursor - 1] ?? ""
  const next = input[cursor] ?? ""
  return !isWordChar(prev) && !isWordChar(next)
}

export function insertWithAutoPair(input: string, cursor: number, char: string): AutoPairResult {
  const next = input[cursor] ?? ""

  if (char === ")" || char === "]" || char === "}" || char === "\"" || char === "'") {
    if (next === char) {
      return {
        value: input,
        cursor: cursor + 1,
        handled: true,
      }
    }
  }

  const close = OPEN_TO_CLOSE[char]
  if (!close) {
    return {
      value: `${input.slice(0, cursor)}${char}${input.slice(cursor)}`,
      cursor: cursor + char.length,
      handled: false,
    }
  }

  if ((char === "\"" || char === "'") && !shouldAutoPairQuote(input, cursor)) {
    return {
      value: `${input.slice(0, cursor)}${char}${input.slice(cursor)}`,
      cursor: cursor + 1,
      handled: false,
    }
  }

  return {
    value: `${input.slice(0, cursor)}${char}${close}${input.slice(cursor)}`,
    cursor: cursor + 1,
    handled: true,
  }
}

export function deleteWithAutoPair(input: string, cursor: number): AutoPairResult {
  if (cursor <= 0) {
    return { value: input, cursor, handled: false }
  }

  const prev = input[cursor - 1] ?? ""
  const next = input[cursor] ?? ""
  const close = OPEN_TO_CLOSE[prev]

  if (close && next === close) {
    return {
      value: `${input.slice(0, cursor - 1)}${input.slice(cursor + 1)}`,
      cursor: cursor - 1,
      handled: true,
    }
  }

  return {
    value: `${input.slice(0, cursor - 1)}${input.slice(cursor)}`,
    cursor: cursor - 1,
    handled: false,
  }
}
