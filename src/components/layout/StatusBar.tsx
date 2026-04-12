import type { FocusZone } from "../../App.tsx"

interface StatusBarProps {
  focusZone: FocusZone
  showQueryLog: boolean
  showDetail: boolean
}

const KEY_STYLE = "#7aa2f7"
const DESC_STYLE = "#565f89"
const SEP = "  "

interface Shortcut {
  key: string
  desc: string
}

function getShortcuts(focusZone: FocusZone, showQueryLog: boolean): Shortcut[] {
  const base: Shortcut[] = [
    { key: "Tab", desc: "Switch Panel" },
    { key: "Ctrl+P", desc: "Commands" },
    { key: "`", desc: showQueryLog ? "Hide Console" : "Show Console" },
    { key: "Ctrl+Q", desc: "Quit" },
  ]

  const contextual: Record<FocusZone, Shortcut[]> = {
    sidebar: [
      { key: "a", desc: "Add" },
      { key: "Enter", desc: "Open/Expand" },
      { key: "h/l", desc: "Collapse/Expand" },
      { key: "e", desc: "Pick DBs" },
      { key: "s", desc: "Search" },
      { key: "m", desc: "Load More" },
      { key: "d", desc: "Disconnect" },
      { key: "x", desc: "Remove" },
    ],
    main: [
      { key: "f//", desc: "Filter" },
      { key: "s", desc: "Sort Col" },
      { key: "]/[", desc: "Switch Tab" },
      { key: "w", desc: "Close Tab" },
      { key: "r", desc: "Reload" },
      { key: "Enter/v", desc: "View Cell" },
    ],
    detail: [
      { key: "Ctrl+A", desc: "Apply" },
      { key: "Esc/q", desc: "Close" },
      { key: "Select", desc: "Copy" },
    ],
    querylog: [
      { key: "Select", desc: "Copy" },
      { key: "Enter", desc: "Re-run" },
    ],
  }

  return [...(contextual[focusZone] ?? []), ...base]
}

export function StatusBar({ focusZone, showQueryLog }: StatusBarProps) {
  const shortcuts = getShortcuts(focusZone, showQueryLog)

  return (
    <box height={1} flexDirection="row" paddingX={1} gap={0}>
      {shortcuts.map((s, i) => (
        <text key={s.key}>
          {i > 0 ? SEP : ""}
          <span fg={KEY_STYLE}>[{s.key}]</span>
          <span fg={DESC_STYLE}> {s.desc}</span>
        </text>
      ))}
    </box>
  )
}
