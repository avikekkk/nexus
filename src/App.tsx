import { useState } from "react"
import { useKeyboard, useRenderer, useTerminalDimensions } from "@opentui/react"
import { Sidebar } from "./components/layout/Sidebar.tsx"
import { MainPanel } from "./components/layout/MainPanel.tsx"
import { DetailPanel } from "./components/layout/DetailPanel.tsx"
import { QueryLog } from "./components/layout/QueryLog.tsx"
import { StatusBar } from "./components/layout/StatusBar.tsx"

export type FocusZone = "sidebar" | "main" | "detail" | "querylog"

const ZONES: FocusZone[] = ["sidebar", "main", "detail", "querylog"]

export function App() {
  const renderer = useRenderer()
  const { width, height } = useTerminalDimensions()
  const [focusZone, setFocusZone] = useState<FocusZone>("sidebar")
  const [showQueryLog, setShowQueryLog] = useState(true)
  const [showDetail, setShowDetail] = useState(false)

  const isNarrow = width < 100

  useKeyboard((key) => {
    if (key.ctrl && key.name === "q") {
      renderer.destroy()
      return
    }

    if (key.name === "`") {
      setShowQueryLog((v) => !v)
      return
    }

    if (key.name === "tab" && !key.ctrl) {
      setFocusZone((z) => {
        const available = ZONES.filter((zone) => {
          if (zone === "detail" && !showDetail) return false
          if (zone === "querylog" && !showQueryLog) return false
          return true
        })
        const idx = available.indexOf(z)
        const next = key.shift ? (idx - 1 + available.length) % available.length : (idx + 1) % available.length
        return available[next]!
      })
      return
    }

    if (key.name === "1") setFocusZone("sidebar")
    if (key.name === "2") setFocusZone("main")
    if (key.name === "3" && showDetail) setFocusZone("detail")
    if (key.name === "4" && showQueryLog) setFocusZone("querylog")
  })

  const sidebarWidth = isNarrow ? 24 : 30
  const detailWidth = showDetail ? (isNarrow ? 20 : 28) : 0
  const queryLogHeight = showQueryLog ? 6 : 0
  const statusBarHeight = 1

  return (
    <box flexDirection="column" width="100%" height="100%">
      {/* Top area: sidebar + main + detail */}
      <box flexDirection="row" flexGrow={1}>
        <Sidebar width={sidebarWidth} focused={focusZone === "sidebar"} />

        <MainPanel focused={focusZone === "main"} />

        {showDetail && <DetailPanel width={detailWidth} focused={focusZone === "detail"} />}
      </box>

      {/* Query log */}
      {showQueryLog && <QueryLog height={queryLogHeight} focused={focusZone === "querylog"} />}

      {/* Status bar */}
      <StatusBar focusZone={focusZone} showQueryLog={showQueryLog} showDetail={showDetail} />
    </box>
  )
}
