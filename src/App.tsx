import { useState, useEffect, useCallback } from "react"
import { useKeyboard, useRenderer, useTerminalDimensions } from "@opentui/react"
import type { Selection } from "@opentui/core"
import { Sidebar } from "./components/layout/Sidebar.tsx"
import { MainPanel } from "./components/layout/MainPanel.tsx"
import { DetailPanel } from "./components/layout/DetailPanel.tsx"
import { debug } from "./utils/debug.ts"
import { Console } from "./components/layout/QueryLog.tsx"
import { StatusBar } from "./components/layout/StatusBar.tsx"
import { ConnectionForm } from "./components/sidebar/ConnectionForm.tsx"
import { useApp } from "./state/AppContext.tsx"
import { Toast } from "./components/layout/Toast.tsx"

export type FocusZone = "sidebar" | "main" | "detail" | "querylog"

const ZONES: FocusZone[] = ["sidebar", "main", "detail", "querylog"]

export function App() {
  const renderer = useRenderer()
  const { width, height } = useTerminalDimensions()
  const { addConnection } = useApp()
  const [focusZone, setFocusZone] = useState<FocusZone>("sidebar")
  const [showQueryLog, setShowQueryLog] = useState(true)
  const [showDetail, setShowDetail] = useState(false)
  const [showConnectionForm, setShowConnectionForm] = useState(false)
  const [toast, setToast] = useState<string | null>(null)

  const isNarrow = width < 100

  const showToast = useCallback((message: string) => {
    setToast(message)
  }, [])

  // Auto-copy selected text to clipboard when mouse selection finishes
  useEffect(() => {
    const handleSelection = (selection: Selection) => {
      const text = selection.getSelectedText()
      if (text) {
        renderer.copyToClipboardOSC52(text)
        debug(`[App] Copied selection (${text.length} chars) to clipboard`)
        // Clear selection so user sees visual feedback
        setTimeout(() => renderer.clearSelection(), 50)
        showToast("Copied to clipboard")
      }
    }
    renderer.on("selection", handleSelection)
    return () => {
      renderer.off("selection", handleSelection)
    }
  }, [renderer, showToast])

  useKeyboard((key) => {
    debug(`[App] key pressed: name="${key.name}", showConnectionForm=${showConnectionForm}`)

    if (key.ctrl && key.name === "q") {
      renderer.destroy()
      return
    }

    // Block all other keys when modal is open
    if (showConnectionForm) return

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
  const queryLogHeight = showQueryLog ? 8 : 0
  const statusBarHeight = 1

  // Center the connection form modal
  const formWidth = 52
  const formHeight = 16
  const formLeft = Math.max(0, Math.floor((width - formWidth) / 2))
  const formTop = Math.max(0, Math.floor((height - formHeight) / 2))

  return (
    <box flexDirection="column" width="100%" height="100%">
      {/* Top area: sidebar + main + detail */}
      <box flexDirection="row" flexGrow={1}>
        <Sidebar
          width={sidebarWidth}
          focused={focusZone === "sidebar"}
          showConnectionForm={showConnectionForm}
          onShowConnectionForm={() => setShowConnectionForm(true)}
        />

        <MainPanel focused={focusZone === "main"} />

        {showDetail && <DetailPanel width={detailWidth} focused={focusZone === "detail"} />}
      </box>

      {/* Console */}
      {showQueryLog && <Console height={queryLogHeight} focused={focusZone === "querylog"} />}

      {/* Status bar */}
      <StatusBar focusZone={focusZone} showQueryLog={showQueryLog} showDetail={showDetail} />

      {/* Toast notification */}
      {toast && <Toast message={toast} onDismiss={() => setToast(null)} />}

      {/* Modal overlay + connection form */}
      {showConnectionForm && (
        <>
          {/* Full-screen dim overlay */}
          <box
            position="absolute"
            left={0}
            top={0}
            width="100%"
            height="100%"
            backgroundColor="#000000"
            opacity={0.6}
            zIndex={50}
          />
          {/* Centered connection form */}
          <ConnectionForm
            left={formLeft}
            top={formTop}
            onSubmit={(config) => {
              debug(`[App] onSubmit received config:`, JSON.stringify(config))
              addConnection(config)
              debug(`[App] addConnection called, hiding form`)
              setShowConnectionForm(false)
            }}
            onCancel={() => setShowConnectionForm(false)}
          />
        </>
      )}
    </box>
  )
}
