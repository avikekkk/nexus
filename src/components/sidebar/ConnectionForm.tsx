import { useState } from "react"
import { useKeyboard } from "@opentui/react"
import type { ConnectionConfig, DbType } from "../../db/types.ts"
import { DEFAULT_PORTS } from "../../db/types.ts"

interface ConnectionFormProps {
  onSubmit: (config: Omit<ConnectionConfig, "id">) => void
  onCancel: () => void
}

const DB_TYPES: { name: string; value: DbType }[] = [
  { name: "MongoDB", value: "mongo" },
  { name: "MySQL", value: "mysql" },
  { name: "Redis", value: "redis" },
]

const FIELD_COUNT = 7

export function ConnectionForm({ onSubmit, onCancel }: ConnectionFormProps) {
  const [name, setName] = useState("")
  const [dbType, setDbType] = useState<DbType>("mongo")
  const [host, setHost] = useState("localhost")
  const [port, setPort] = useState(String(DEFAULT_PORTS.mongo))
  const [username, setUsername] = useState("")
  const [password, setPassword] = useState("")
  const [focusIndex, setFocusIndex] = useState(0)

  useKeyboard((key) => {
    if (key.name === "escape") {
      onCancel()
      return
    }

    if (key.name === "tab") {
      setFocusIndex((i) => {
        const next = key.shift ? (i - 1 + FIELD_COUNT) % FIELD_COUNT : (i + 1) % FIELD_COUNT
        return next
      })
      return
    }

    if (key.name === "enter" && focusIndex === 6) {
      onSubmit({
        name: name || `${dbType} connection`,
        type: dbType,
        host,
        port: parseInt(port, 10) || DEFAULT_PORTS[dbType],
        username: username || undefined,
        password: password || undefined,
      })
      return
    }

    if (focusIndex === 1) {
      if (key.name === "left" || key.name === "right" || key.name === "j" || key.name === "k") {
        const currentIdx = DB_TYPES.findIndex((t) => t.value === dbType)
        const dir = key.name === "left" || key.name === "k" ? -1 : 1
        const nextIdx = (currentIdx + dir + DB_TYPES.length) % DB_TYPES.length
        const next = DB_TYPES[nextIdx]!
        setDbType(next.value)
        setPort(String(DEFAULT_PORTS[next.value]))
      }
    }
  })

  const labelWidth = 11
  const inputWidth = 32
  const labelFg = "#565f89"
  const activeLabelFg = "#7aa2f7"

  return (
    <box
      position="absolute"
      left={2}
      top={1}
      width={52}
      height={16}
      flexDirection="column"
      border
      borderStyle="rounded"
      borderColor="#7aa2f7"
      backgroundColor="#1a1b26"
      title=" New Connection "
      titleAlignment="center"
      zIndex={10}
    >
      <box flexDirection="column" padding={1} gap={0}>
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

        {/* Host */}
        <box flexDirection="row" gap={1}>
          <text width={labelWidth} fg={focusIndex === 2 ? activeLabelFg : labelFg}>
            Host
          </text>
          <input
            value={host}
            onChange={setHost}
            placeholder="localhost"
            focused={focusIndex === 2}
            width={inputWidth}
            backgroundColor="#16161e"
            focusedBackgroundColor="#292e42"
            textColor="#c0caf5"
          />
        </box>

        {/* Port */}
        <box flexDirection="row" gap={1}>
          <text width={labelWidth} fg={focusIndex === 3 ? activeLabelFg : labelFg}>
            Port
          </text>
          <input
            value={port}
            onChange={setPort}
            placeholder={String(DEFAULT_PORTS[dbType])}
            focused={focusIndex === 3}
            width={inputWidth}
            backgroundColor="#16161e"
            focusedBackgroundColor="#292e42"
            textColor="#c0caf5"
          />
        </box>

        {/* Username */}
        <box flexDirection="row" gap={1}>
          <text width={labelWidth} fg={focusIndex === 4 ? activeLabelFg : labelFg}>
            Username
          </text>
          <input
            value={username}
            onChange={setUsername}
            placeholder="optional"
            focused={focusIndex === 4}
            width={inputWidth}
            backgroundColor="#16161e"
            focusedBackgroundColor="#292e42"
            textColor="#c0caf5"
          />
        </box>

        {/* Password */}
        <box flexDirection="row" gap={1}>
          <text width={labelWidth} fg={focusIndex === 5 ? activeLabelFg : labelFg}>
            Password
          </text>
          <input
            value={password}
            onChange={setPassword}
            placeholder="optional"
            focused={focusIndex === 5}
            width={inputWidth}
            backgroundColor="#16161e"
            focusedBackgroundColor="#292e42"
            textColor="#c0caf5"
          />
        </box>

        {/* Submit button */}
        <box flexDirection="row" gap={1} marginTop={1}>
          <text width={labelWidth}>{" "}</text>
          <box
            width={inputWidth}
            backgroundColor={focusIndex === 6 ? "#7aa2f7" : "#292e42"}
            justifyContent="center"
          >
            <text fg={focusIndex === 6 ? "#1a1b26" : "#a9b1d6"}> Save Connection </text>
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
