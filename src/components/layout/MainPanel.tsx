interface MainPanelProps {
  focused: boolean
}

export function MainPanel({ focused }: MainPanelProps) {
  const borderColor = focused ? "#7aa2f7" : "#414868"

  return (
    <box
      flexGrow={1}
      flexDirection="column"
      border
      borderStyle="rounded"
      borderColor={borderColor}
    >
      {/* Tab bar area */}
      <box height={1} paddingX={1}>
        <text fg="#565f89">No tabs open</text>
      </box>

      {/* Separator */}
      <box height={1} paddingX={0}>
        <text fg="#414868">{"─".repeat(200)}</text>
      </box>

      {/* Content area */}
      <box flexGrow={1} flexDirection="column" justifyContent="center" alignItems="center">
        <text fg="#565f89">Connect to a database to get started</text>
        <text fg="#414868">
          Press <span fg="#7aa2f7">1</span> to focus sidebar, then <span fg="#7aa2f7">a</span> to add a connection
        </text>
      </box>
    </box>
  )
}
