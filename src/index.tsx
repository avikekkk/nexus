import { createCliRenderer } from "@opentui/core"
import { createRoot } from "@opentui/react"
import { App } from "./App.tsx"
import { AppProvider, disconnectAllDrivers } from "./state/AppContext.tsx"
import { ThemeProvider } from "./theme/ThemeContext.tsx"

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
  <ThemeProvider>
    <AppProvider>
      <App />
    </AppProvider>
  </ThemeProvider>
)
