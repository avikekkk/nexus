type PasteListener = (text: string) => void

const listeners = new Set<PasteListener>()

export function subscribePaste(listener: PasteListener): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function emitPaste(text: string): void {
  for (const listener of listeners) {
    listener(text)
  }
}
