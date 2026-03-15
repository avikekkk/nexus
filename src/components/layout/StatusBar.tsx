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
    { key: "`", desc: showQueryLog ? "Hide Log" : "Show Log" },
    { key: "Ctrl+Q", desc: "Quit" },
  ]

  const contextual: Record<FocusZone, Shortcut[]> = {
    sidebar: [
      { key: "a", desc: "Add Connection" },
      { key: "Enter", desc: "Expand" },
      { key: "d", desc: "Disconnect" },
    ],
    main: [
      { key: "Enter", desc: "View Cell" },
      { key: "/", desc: "Filter" },
      { key: "v", desc: "Switch View" },
    ],
    detail: [
      { key: "Esc", desc: "Close" },
      { key: "c", desc: "Copy" },
    ],
    querylog: [
      { key: "c", desc: "Copy Query" },
      { key: "Enter", desc: "Re-run" },
    ],
  }

  return [...(contextual[focusZone] ?? []), ...base]
}

export function StatusBar({ focusZone, showQueryLog, showDetail }: StatusBarProps) {
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
