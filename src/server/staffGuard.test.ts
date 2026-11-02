import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const APP = fileURLToPath(new URL('../app', import.meta.url))
const STAFF_ROOTS = [path.join(APP, '(staff)'), path.join(APP, 'api', 'staff')]
const ENTRY = /^(page\.tsx|route\.ts)$/
const GUARD = /\b(requireStaffContext|requireStaffActor|staffActorOrNull)\(/

function entries(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const full = path.join(dir, e.name)
    if (e.isDirectory()) return entries(full)
    return ENTRY.test(e.name) ? [full] : []
  })
}

describe('staff entry points', () => {
  const files = STAFF_ROOTS.flatMap(entries)

  it('finds the staff pages and routes', () => {
    expect(files.length).toBeGreaterThan(20)
  })

  it.each(
    files.map((f) => [path.relative(APP, f), f]),
  )('%s checks for a staff actor itself and does not rely on the layout', (_name, file) => {
    expect(readFileSync(file, 'utf8')).toMatch(GUARD)
  })
})
