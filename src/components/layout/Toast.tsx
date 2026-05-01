import { useEffect } from "react"
import { useTheme } from "../../theme/ThemeContext.tsx"

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

  const { colors } = useTheme()
  const padding = 2

  return (
    <box
      position="absolute"
      right={1}
      top={1}
      zIndex={100}
      border
      borderStyle="rounded"
      borderColor={colors.border}
      backgroundColor={colors.background}
      paddingX={padding}
    >
      <text fg={colors.info}>{message}</text>
    </box>
  )
}
