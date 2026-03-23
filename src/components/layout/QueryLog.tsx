import { useApp } from "../../state/AppContext.tsx"
import { formatTimestamp, type ConsoleEntry } from "../../state/console.ts"

interface ConsoleProps {
  height: number
  focused: boolean
}

function formatEntry(entry: ConsoleEntry): string {
  const time = formatTimestamp(entry.timestamp)
  const levelLabel = entry.level === "warning" ? "WARN" : entry.level.toUpperCase()
  return `${time} │ ${entry.source.toUpperCase().padEnd(10)} │ ${levelLabel.padEnd(8)}${entry.message}`
}

function getLevelColor(level: ConsoleEntry["level"]): string {
  switch (level) {
    case "error":
      return "#f7768e"
    case "warning":
      return "#e0af68"
    case "info":
      return "#7aa2f7"
    case "success":
      return "#9ece6a"
    default:
      return "#a9b1d6"
  }
}

export function Console({ height, focused }: ConsoleProps) {
  const { state } = useApp()
  const borderColor = focused ? "#7aa2f7" : "#414868"
  const entries = state.consoleEntries

  return (
    <box
      height={height}
      flexDirection="column"
      border
      borderStyle="rounded"
      borderColor={borderColor}
      title=" Console "
      titleAlignment="left"
    >
      {entries.length === 0 ? (
        <box flexGrow={1} paddingX={1}>
          <text fg="#565f89">No activity yet</text>
        </box>
      ) : (
        <scrollbox
          flexGrow={1}
          paddingX={1}
          focused={focused}
          stickyScroll
          stickyStart="bottom"
          scrollY
          scrollX={false}
          verticalScrollbarOptions={{
            showArrows: false,
            trackOptions: {
              backgroundColor: "#1a1b26",
              foregroundColor: "#414868",
            },
          }}
        >
          {entries.map((entry, idx) => (
            <text key={idx} fg={getLevelColor(entry.level)}>
              {formatEntry(entry)}
            </text>
          ))}
        </scrollbox>
      )}
    </box>
  )
}
