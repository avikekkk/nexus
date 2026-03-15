interface SidebarProps {
  width: number
  focused: boolean
}

export function Sidebar({ width, focused }: SidebarProps) {
  const borderColor = focused ? "#7aa2f7" : "#414868"

  return (
    <box
      width={width}
      flexDirection="column"
      border
      borderStyle="rounded"
      borderColor={borderColor}
      title=" Connections "
      titleAlignment="left"
    >
      <box flexDirection="column" padding={1} gap={0}>
        <text fg="#565f89">No connections yet</text>
        <text fg="#565f89">Press <span fg="#7aa2f7">a</span> to add one</text>
      </box>
    </box>
  )
}
