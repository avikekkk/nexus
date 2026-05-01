import { spawnSync } from "node:child_process"

interface Section {
  title: string
  prefixes: string[]
  commits: string[]
}

function git(args: string[], fallback = ""): string {
  const result = spawnSync("git", args, { encoding: "utf-8" })
  if (result.status !== 0) return fallback
  return result.stdout.trim()
}

function stripHash(subject: string): string {
  return subject.replace(/^[a-f0-9]{7,}\s+/, "")
}

function formatCommit(subject: string): string {
  return `- ${stripHash(subject)}`
}

const tag = process.argv[2] ?? git(["describe", "--tags", "--abbrev=0"], "latest")
const previousTag = git(["describe", "--tags", "--abbrev=0", `${tag}^`])
const range = previousTag ? `${previousTag}..${tag}` : tag
const subjects = git(["log", "--pretty=format:%h %s", range])
  .split("\n")
  .map((line) => line.trim())
  .filter(Boolean)

const sections: Section[] = [
  { title: "Features", prefixes: ["feat"], commits: [] },
  { title: "Fixes", prefixes: ["fix"], commits: [] },
  { title: "Performance", prefixes: ["perf"], commits: [] },
  { title: "Refactors", prefixes: ["refactor"], commits: [] },
  { title: "Documentation", prefixes: ["docs"], commits: [] },
  { title: "Tests and Tooling", prefixes: ["test", "chore", "ci", "build"], commits: [] },
  { title: "Other Changes", prefixes: [], commits: [] },
]

for (const subject of subjects) {
  const normalized = stripHash(subject).toLowerCase()
  const section =
    sections.find((candidate) =>
      candidate.prefixes.some((prefix) => normalized.startsWith(`${prefix}:`) || normalized.startsWith(`${prefix}(`))
    ) ?? sections[sections.length - 1]!

  section.commits.push(formatCommit(subject))
}

console.log(`# Nexus ${tag}`)
console.log("")

if (previousTag) {
  console.log(`Changes since ${previousTag}.`)
} else {
  console.log("Initial tagged release.")
}

console.log("")

if (subjects.length === 0) {
  console.log("- No commits found for this tag.")
} else {
  for (const section of sections) {
    if (section.commits.length === 0) continue
    console.log(`## ${section.title}`)
    console.log(section.commits.join("\n"))
    console.log("")
  }
}
