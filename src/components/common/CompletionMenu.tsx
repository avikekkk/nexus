import type { CompletionSuggestion } from "../../query/completion/types.ts"

interface CompletionMenuProps {
  visible: boolean
  items: CompletionSuggestion[]
  selectedIndex: number
  maxItems?: number
}

const KIND_COLORS = {
  database: "#e0af68",
  collection: "#9ece6a",
  operation: "#7aa2f7",
  snippet: "#bb9af7",
} as const

export function CompletionMenu({ visible, items, selectedIndex, maxItems = 5 }: CompletionMenuProps) {
  if (!visible || items.length === 0) return null

  const visibleItems = items.slice(0, maxItems)
  const maxLabelLength = visibleItems.reduce((max, item) => Math.max(max, item.label.length), 0)
  const menuWidth = Math.min(46, Math.max(20, maxLabelLength + 14))

  return (
    <box flexDirection="column" backgroundColor="#23283a" width={menuWidth}>
      {visibleItems.map((item, index) => {
        const active = index === selectedIndex
        const kindColor = KIND_COLORS[item.kind]
        const kindLabel = item.kind[0]?.toUpperCase() ?? ""
        return (
          <box key={item.id} paddingX={1} height={1} flexDirection="row" justifyContent="space-between" backgroundColor={active ? "#2f354a" : undefined}>
            <text fg={active ? "#c0caf5" : "#a9b1d6"}>{item.label}</text>
            <text fg={kindColor}>{kindLabel}</text>
          </box>
        )
      })}
    </box>
  )
}
