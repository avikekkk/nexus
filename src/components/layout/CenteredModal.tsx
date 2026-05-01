import type { ReactNode } from "react"
import { useTheme } from "../../theme/ThemeContext.tsx"

interface PasteEventLike {
  text: string
  preventDefault?: () => void
  stopPropagation?: () => void
}

interface CenteredModalProps {
  width: number
  height: number
  minWidth: number
  maxWidth: number
  minHeight: number
  maxHeight: number
  widthPadding: number
  heightPadding: number
  title: string
  onPaste: (event: PasteEventLike) => void
  children: ReactNode
}

export function createPasteHandler(applyPastedText: (text: string) => void) {
  return (event: PasteEventLike) => {
    applyPastedText(event.text)
    event.preventDefault?.()
    event.stopPropagation?.()
  }
}

export function CenteredModal({
  width,
  height,
  minWidth,
  maxWidth,
  minHeight,
  maxHeight,
  widthPadding,
  heightPadding,
  title,
  onPaste,
  children,
}: CenteredModalProps) {
  const { colors } = useTheme()
  const panelWidth = Math.min(maxWidth, Math.max(minWidth, width - widthPadding))
  const panelHeight = Math.min(maxHeight, Math.max(minHeight, height - heightPadding))
  const left = Math.max(0, Math.floor((width - panelWidth) / 2))
  const top = Math.max(0, Math.floor((height - panelHeight) / 2))

  return (
    <>
      <box
        position="absolute"
        left={0}
        top={0}
        width="100%"
        height="100%"
        backgroundColor={colors.overlay}
        opacity={0.6}
        zIndex={80}
      />
      <box
        position="absolute"
        left={left}
        top={top}
        onPaste={onPaste}
        width={panelWidth}
        height={panelHeight}
        border
        borderStyle="rounded"
        borderColor={colors.purple}
        backgroundColor={colors.background}
        title={` ${title} `}
        zIndex={90}
        flexDirection="column"
      >
        {children}
      </box>
    </>
  )
}
