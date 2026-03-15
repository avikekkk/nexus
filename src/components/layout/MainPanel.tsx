import { useApp } from "../../state/AppContext.tsx"

interface MainPanelProps {
  focused: boolean
}

export function MainPanel({ focused }: MainPanelProps) {
  const { state, dispatch } = useApp()
  const borderColor = focused ? "#7aa2f7" : "#414868"
  const { tabs, activeTabId } = state

  return (
    <box
      flexGrow={1}
      flexDirection="column"
      border
      borderStyle="rounded"
      borderColor={borderColor}
    >
      {/* Tab bar */}
      <box height={1} paddingX={1} flexDirection="row" gap={1}>
        {tabs.length === 0 ? (
          <text fg="#565f89">No tabs open</text>
        ) : (
          tabs.map((tab) => {
            const isActive = tab.id === activeTabId
            return (
              <text key={tab.id} fg={isActive ? "#7aa2f7" : "#565f89"} bg={isActive ? "#292e42" : "transparent"}>
                {isActive ? " " : " "}
                {tab.label}
                {" "}
              </text>
            )
          })
        )}
      </box>

      {/* Separator */}
      <box height={1} paddingX={0}>
        <text fg="#414868">{"─".repeat(200)}</text>
      </box>

      {/* Content area */}
      <box flexGrow={1} flexDirection="column" justifyContent="center" alignItems="center">
        {activeTabId ? (
          <>
            {(() => {
              const tab = tabs.find((t) => t.id === activeTabId)
              if (!tab) return <text fg="#565f89">Tab not found</text>
              return (
                <>
                  <text fg="#c0caf5">
                    {tab.database}.{tab.collection}
                  </text>
                  <text fg="#565f89">Data table coming in Phase 3</text>
                </>
              )
            })()}
          </>
        ) : (
          <>
            <text fg="#565f89">Connect to a database to get started</text>
            <text fg="#414868">
              Press <span fg="#7aa2f7">1</span> to focus sidebar, then <span fg="#7aa2f7">a</span> to add a connection
            </text>
          </>
        )}
      </box>
    </box>
  )
}
