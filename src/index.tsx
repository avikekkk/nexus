import { createCliRenderer } from "@opentui/core"
import { createRoot } from "@opentui/react"
import { App } from "./App.tsx"

const renderer = await createCliRenderer({
  exitOnCtrlC: true,
  targetFps: 60,
  useMouse: true,
})

createRoot(renderer).render(<App />)
