import { existsSync, mkdirSync, rmSync, statSync } from "node:fs"
import { dirname, join } from "node:path"
import { spawnSync } from "node:child_process"

const [, , target, outfile] = process.argv

if (!target || !outfile) {
  console.error("Usage: bun scripts/build-bin.ts <bun-target> <outfile>")
  process.exit(1)
}

function run(command: string, args: string[]): void {
  const result = spawnSync(command, args, { stdio: "inherit" })
  if (result.error) throw result.error
  if (result.status !== 0) process.exit(result.status ?? 1)
}

function removeIfExists(path: string): void {
  if (existsSync(path)) rmSync(path, { force: true })
}

function formatBytes(bytes: number): string {
  const mib = bytes / 1024 / 1024
  return `${mib.toFixed(1)} MiB`
}

mkdirSync(dirname(outfile), { recursive: true })

run("bun", [
  "build",
  "src/index.tsx",
  "--compile",
  "--minify",
  "--sourcemap=none",
  "--no-compile-autoload-dotenv",
  "--no-compile-autoload-bunfig",
  `--target=${target}`,
  `--outfile=${outfile}`,
])

removeIfExists(`${outfile}.map`)
removeIfExists(join(dirname(outfile), "index.js.map"))

const size = statSync(outfile).size
console.log(`Built ${outfile} (${formatBytes(size)})`)
