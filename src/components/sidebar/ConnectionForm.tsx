import { useState, useEffect } from "react"
import { useKeyboard } from "@opentui/react"
import type { ConnectionConfig, DbType } from "../../db/types.ts"
import { DEFAULT_PORTS } from "../../db/types.ts"
import { parseConnectionUrl } from "../../db/url.ts"
import { debug } from "../../utils/debug.ts"

interface ConnectionFormProps {
  left?: number
  top?: number
  editMode?: boolean
  existingConfig?: ConnectionConfig
  onSubmit: (config: Omit<ConnectionConfig, "id">) => void
  onCancel: () => void
}

const DB_TYPES: { name: string; value: DbType }[] = [
  { name: "MongoDB", value: "mongo" },
  { name: "MySQL", value: "mysql" },
  { name: "Redis", value: "redis" },
]

const FIELD_COUNT = 8

export function ConnectionForm({ left, top, editMode = false, existingConfig, onSubmit, onCancel }: ConnectionFormProps) {
  const [name, setName] = useState(existingConfig?.name ?? "")
  const [dbType, setDbType] = useState<DbType>(existingConfig?.type ?? "mongo")
  const [url, setUrl] = useState(existingConfig?.url ?? "")
  const [host, setHost] = useState(existingConfig?.host ?? "localhost")
  const [port, setPort] = useState(String(existingConfig?.port ?? DEFAULT_PORTS.mongo))
  const [username, setUsername] = useState(existingConfig?.username ?? "")
  const [password, setPassword] = useState(existingConfig?.password ?? "")
  const [focusIndex, setFocusIndex] = useState(0)
  const [urlError, setUrlError] = useState("")

  const hasUrl = url.trim().length > 0

  // Validate and apply URL overrides whenever url or dbType changes
  useEffect(() => {
    if (!hasUrl) {
      setUrlError("")
      return
    }
    const result = parseConnectionUrl(url, dbType)
    if (!result.valid) {
      setUrlError(result.error ?? "Invalid URL")
      return
    }
    setUrlError("")
    const p = result.parsed!
    setHost(p.host)
    setPort(String(p.port))
    setUsername(p.username ?? "")
    setPassword(p.password ?? "")
  }, [url, dbType])

  // Fields disabled when URL is provided (host, port, username, password)
  const disabledFields = hasUrl ? new Set([3, 4, 5, 6]) : new Set<number>()

  useKeyboard((key) => {
    debug(`[ConnectionForm] key pressed: name="${key.name}", focusIndex=${focusIndex}, hasUrl=${hasUrl}, urlError="${urlError}"`)

    if (key.name === "escape") {
      onCancel()
      return
    }

    if (key.name === "tab") {
      setFocusIndex((i) => {
        const dir = key.shift ? -1 : 1
        let next = (i + dir + FIELD_COUNT) % FIELD_COUNT
        while (disabledFields.has(next)) {
          next = (next + dir + FIELD_COUNT) % FIELD_COUNT
        }
        debug(`[ConnectionForm] tab: focusIndex ${i} -> ${next} (shift=${key.shift})`)
        return next
      })
      return
    }

    if (key.name === "return") {
      debug(`[ConnectionForm] enter pressed: focusIndex=${focusIndex}, expected=7, match=${focusIndex === 7}`)
      if (focusIndex === 7) {
        if (hasUrl && urlError) {
          debug(`[ConnectionForm] blocked: URL has error: "${urlError}"`)
          return
        }
        const config = {
          name: name || `${dbType} connection`,
          type: dbType,
          host,
          port: parseInt(port, 10) || DEFAULT_PORTS[dbType],
          username: username || undefined,
          password: password || undefined,
          url: hasUrl ? url.trim() : undefined,
        }
        debug(`[ConnectionForm] calling onSubmit with:`, JSON.stringify(config))
        onSubmit(config)
        return
      }
    }

    if (focusIndex === 1) {
      if (key.name === "left" || key.name === "right" || key.name === "j" || key.name === "k") {
        const currentIdx = DB_TYPES.findIndex((t) => t.value === dbType)
        const dir = key.name === "left" || key.name === "k" ? -1 : 1
        const nextIdx = (currentIdx + dir + DB_TYPES.length) % DB_TYPES.length
        const next = DB_TYPES[nextIdx]!
        setDbType(next.value)
        if (!hasUrl) {
          setPort(String(DEFAULT_PORTS[next.value]))
        }
      }
    }
  })

  const labelWidth = 11
  const inputWidth = 32
  const labelFg = "#565f89"
  const activeLabelFg = "#7aa2f7"
  const disabledFg = "#414868"

  return (
    <box
      position="absolute"
      left={left ?? 2}
      top={top ?? 1}
      width={52}
      height={editMode ? 21 : 19}
      flexDirection="column"
      border
      borderStyle="rounded"
      borderColor="#7aa2f7"
      backgroundColor="#1a1b26"
      title=" New Connection "
      titleAlignment="center"
      zIndex={100}
    >
      <box flexDirection="column" padding={1} gap={0}>
        {editMode && (
          <box flexDirection="row" marginBottom={1}>
            <text fg="#e0af68">Editing: {existingConfig?.name}</text>
          </box>
        )}
        {/* Name */}
        <box flexDirection="row" gap={1}>
          <text width={labelWidth} fg={focusIndex === 0 ? activeLabelFg : labelFg}>
            Name
          </text>
          <input
            value={name}
            onChange={setName}
            placeholder="My Database"
            focused={focusIndex === 0}
            width={inputWidth}
            backgroundColor="#16161e"
            focusedBackgroundColor="#292e42"
            textColor="#c0caf5"
          />
        </box>

        {/* Type */}
        <box flexDirection="row" gap={1}>
          <text width={labelWidth} fg={focusIndex === 1 ? activeLabelFg : labelFg}>
            Type
          </text>
          <box flexDirection="row" gap={1} width={inputWidth}>
            {DB_TYPES.map((t) => (
              <text
                key={t.value}
                fg={dbType === t.value ? "#1a1b26" : "#a9b1d6"}
                bg={dbType === t.value ? "#7aa2f7" : "#292e42"}
              >
                {" "}
                {t.name}{" "}
              </text>
            ))}
          </box>
        </box>

        {/* URL */}
        <box flexDirection="row" gap={1}>
          <text width={labelWidth} fg={focusIndex === 2 ? activeLabelFg : labelFg}>
            URL
          </text>
          <input
            value={url}
            onChange={setUrl}
            placeholder="mongodb://user:pass@host:port/db"
            focused={focusIndex === 2}
            width={inputWidth}
            backgroundColor="#16161e"
            focusedBackgroundColor="#292e42"
            textColor="#c0caf5"
          />
        </box>

        {/* URL error */}
        {hasUrl && urlError ? (
          <box flexDirection="row" gap={1}>
            <text width={labelWidth}>{" "}</text>
            <text fg="#f7768e" width={inputWidth}>
              {urlError}
            </text>
          </box>
        ) : null}

        {/* Host */}
        <box flexDirection="row" gap={1}>
          <text width={labelWidth} fg={hasUrl ? disabledFg : focusIndex === 3 ? activeLabelFg : labelFg}>
            Host
          </text>
          <input
            value={host}
            onChange={hasUrl ? () => {} : setHost}
            placeholder="localhost"
            focused={!hasUrl && focusIndex === 3}
            width={inputWidth}
            backgroundColor="#16161e"
            focusedBackgroundColor={hasUrl ? "#16161e" : "#292e42"}
            textColor={hasUrl ? disabledFg : "#c0caf5"}
          />
        </box>

        {/* Port */}
        <box flexDirection="row" gap={1}>
          <text width={labelWidth} fg={hasUrl ? disabledFg : focusIndex === 4 ? activeLabelFg : labelFg}>
            Port
          </text>
          <input
            value={port}
            onChange={hasUrl ? () => {} : setPort}
            placeholder={String(DEFAULT_PORTS[dbType])}
            focused={!hasUrl && focusIndex === 4}
            width={inputWidth}
            backgroundColor="#16161e"
            focusedBackgroundColor={hasUrl ? "#16161e" : "#292e42"}
            textColor={hasUrl ? disabledFg : "#c0caf5"}
          />
        </box>

        {/* Username */}
        <box flexDirection="row" gap={1}>
          <text width={labelWidth} fg={hasUrl ? disabledFg : focusIndex === 5 ? activeLabelFg : labelFg}>
            Username
          </text>
          <input
            value={username}
            onChange={hasUrl ? () => {} : setUsername}
            placeholder="optional"
            focused={!hasUrl && focusIndex === 5}
            width={inputWidth}
            backgroundColor="#16161e"
            focusedBackgroundColor={hasUrl ? "#16161e" : "#292e42"}
            textColor={hasUrl ? disabledFg : "#c0caf5"}
          />
        </box>

        {/* Password */}
        <box flexDirection="row" gap={1}>
          <text width={labelWidth} fg={hasUrl ? disabledFg : focusIndex === 6 ? activeLabelFg : labelFg}>
            Password
          </text>
          <input
            value={password}
            onChange={hasUrl ? () => {} : setPassword}
            placeholder="optional"
            focused={!hasUrl && focusIndex === 6}
            width={inputWidth}
            backgroundColor="#16161e"
            focusedBackgroundColor={hasUrl ? "#16161e" : "#292e42"}
            textColor={hasUrl ? disabledFg : "#c0caf5"}
          />
        </box>

        {/* Submit button */}
        <box flexDirection="row" gap={1} marginTop={1}>
          <text width={labelWidth}>{" "}</text>
          <box
            width={inputWidth}
            backgroundColor={focusIndex === 7 ? "#7aa2f7" : "#292e42"}
            justifyContent="center"
          >
            <text fg={focusIndex === 7 ? "#1a1b26" : "#a9b1d6"}> Save Connection </text>
          </box>
        </box>
      </box>

      {/* Hints */}
      <box paddingX={1}>
        <text fg="#414868">
          <span fg="#565f89">[Tab]</span> Next {"  "}
          <span fg="#565f89">[Enter]</span> Save {"  "}
          <span fg="#565f89">[Esc]</span> Cancel
        </text>
      </box>
    </box>
  )
}
