import { useMemo } from "react"
import { SyntaxStyle, RGBA } from "@opentui/core"
import { useApp } from "../../state/AppContext.tsx"
import { formatTimestamp, type ConsoleEntry } from "../../state/console.ts"

interface ConsoleProps {
  height: number
  focused: boolean
}

function formatEntry(entry: ConsoleEntry): string {
  const time = formatTimestamp(entry.timestamp)
  const levelLabel = entry.level === "warning" ? "WARN" : entry.level.toUpperCase()
  return `${time} │ ${entry.source.toUpperCase().padEnd(10)} │ ${levelLabel.padEnd(7)}${entry.message}`
}

export function Console({ height, focused }: ConsoleProps) {
  const { state } = useApp()
  const borderColor = focused ? "#7aa2f7" : "#414868"
  const entries = state.consoleEntries

  // Show the most recent entries that fit in the available height
  const maxVisible = Math.max(0, height - 2) // subtract border top + bottom
  const visible = entries.slice(-maxVisible)

  // Create a simple syntax style for the console (no highlighting, just base colors)
  const syntaxStyle = useMemo(() => {
    const style = SyntaxStyle.create()
    style.registerStyle("text", { fg: RGBA.fromHex("#565f89") })
    return style
  }, [])

  const content = visible.map(formatEntry).join("\n")

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
      {visible.length === 0 ? (
        <box flexGrow={1} paddingX={1}>
          <text fg="#565f89">No activity yet</text>
        </box>
      ) : (
        <code
          content={content}
          syntaxStyle={syntaxStyle}
          selectable
          fg="#a9b1d6"
          paddingX={1}
          flexGrow={1}
        />
      )}
    </box>
  )
}
