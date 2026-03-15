interface DetailPanelProps {
  width: number
  focused: boolean
}

export function DetailPanel({ width, focused }: DetailPanelProps) {
  const borderColor = focused ? "#7aa2f7" : "#414868"

  return (
    <box
      width={width}
      flexDirection="column"
      border
      borderStyle="rounded"
      borderColor={borderColor}
      title=" Detail "
      titleAlignment="left"
    >
      <box flexGrow={1} padding={1} justifyContent="center" alignItems="center">
        <text fg="#565f89">Select a cell to view</text>
      </box>
    </box>
  )
}
