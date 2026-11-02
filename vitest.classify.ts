import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'

const DB_MARKER = /@\/test\/db|@\/test\/minio|makeTestDb|withTestDb|testHarness|@testcontainers\//

const SKIPPED_DIRS = new Set(['node_modules', '.next', '.git', '.claude', '.worktrees'])

function collectTests(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      if (SKIPPED_DIRS.has(entry.name)) continue
      collectTests(full, acc)
    } else if (/\.test\.tsx?$/.test(entry.name)) {
      acc.push(full)
    }
  }
  return acc
}

export function classifyTests(root: string): { unit: string[]; integration: string[] } {
  const unit: string[] = []
  const integration: string[] = []
  for (const file of collectTests(root)) {
    const rel = path.relative(root, file).split(path.sep).join('/')
    const lane = DB_MARKER.test(readFileSync(file, 'utf8')) ? integration : unit
    lane.push(rel)
  }
  return { unit, integration }
}
