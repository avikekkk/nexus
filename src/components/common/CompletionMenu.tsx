import type { CompletionSuggestion } from "../../query/completion/types.ts"
import { useTheme } from "../../theme/ThemeContext.tsx"

interface CompletionMenuProps {
  visible: boolean
  items: CompletionSuggestion[]
  selectedIndex: number
  maxItems?: number
}

export function CompletionMenu({ visible, items, selectedIndex, maxItems = 5 }: CompletionMenuProps) {
  const { colors } = useTheme()
  const kindColors = {
    database: colors.warning,
    collection: colors.success,
    field: colors.teal,
    operation: colors.accent,
    snippet: colors.purple,
  } as const
  if (!visible || items.length === 0) return null

  const visibleItems = items.slice(0, maxItems)
  const maxLabelLength = visibleItems.reduce((max, item) => Math.max(max, item.label.length), 0)
  const menuWidth = Math.min(46, Math.max(20, maxLabelLength + 14))

  return (
    <box flexDirection="column" backgroundColor={colors.completionBackground} width={menuWidth}>
      {visibleItems.map((item, index) => {
        const active = index === selectedIndex
        const kindColor = kindColors[item.kind]
        const kindLabel = item.kind[0]?.toUpperCase() ?? ""
        return (
          <box key={item.id} paddingX={1} height={1} flexDirection="row" justifyContent="space-between" backgroundColor={active ? colors.completionSurface : undefined}>
            <text fg={active ? colors.textBright : colors.text}>{item.label}</text>
            <text fg={kindColor}>{kindLabel}</text>
          </box>
        )
      })}
    </box>
  )
}
