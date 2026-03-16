import { createCliRenderer } from "@opentui/core"
import { createRoot } from "@opentui/react"
import { App } from "./App.tsx"
import { AppProvider, disconnectAllDrivers } from "./state/AppContext.tsx"

const renderer = await createCliRenderer({
  exitOnCtrlC: true,
  targetFps: 60,
  useMouse: true,
  useKittyKeyboard: {
    disambiguate: true,
    alternateKeys: true,
  },
  onDestroy: () => {
    disconnectAllDrivers().finally(() => process.exit(0))
  },
})

createRoot(renderer).render(
  <AppProvider>
    <App />
  </AppProvider>
)
