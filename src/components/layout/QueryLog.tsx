interface QueryLogProps {
  height: number
  focused: boolean
}

export function QueryLog({ height, focused }: QueryLogProps) {
  const borderColor = focused ? "#7aa2f7" : "#414868"

  return (
    <box
      height={height}
      flexDirection="column"
      border
      borderStyle="rounded"
      borderColor={borderColor}
      title=" Query Log "
      titleAlignment="left"
    >
      <box flexGrow={1} paddingX={1}>
        <text fg="#565f89">No queries executed yet</text>
      </box>
    </box>
  )
}
