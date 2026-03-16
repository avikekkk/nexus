import { useEffect } from "react"

interface ToastProps {
  message: string
  durationMs?: number
  onDismiss: () => void
}

export function Toast({ message, durationMs = 2000, onDismiss }: ToastProps) {
  useEffect(() => {
    const timer = setTimeout(onDismiss, durationMs)
    return () => clearTimeout(timer)
  }, [message, durationMs, onDismiss])

  const padding = 2

  return (
    <box
      position="absolute"
      right={1}
      top={1}
      zIndex={100}
      border
      borderStyle="rounded"
      borderColor="#414868"
      backgroundColor="#1a1b26"
      paddingX={padding}
    >
      <text fg="#7aa2f7">{message}</text>
    </box>
  )
}
