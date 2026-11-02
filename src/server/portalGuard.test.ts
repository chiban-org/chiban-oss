import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const APP = fileURLToPath(new URL('../app', import.meta.url))
const PORTAL_ROOTS = [
  path.join(APP, '(public)', 'portal'),
  path.join(APP, '(public)', 'claim'),
  path.join(APP, '(public)', 'payments'),
]
const ENTRY = /^(page\.tsx|route\.ts)$/
const GUARD = /\b(requirePortalContext|portalActorOrNull|openPacket|openPacketVersion)\(/

function entries(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const full = path.join(dir, e.name)
    if (e.isDirectory()) return entries(full)
    return ENTRY.test(e.name) ? [full] : []
  })
}

describe('portal entry points', () => {
  const files = PORTAL_ROOTS.flatMap(entries)

  it('finds the portal pages and routes', () => {
    expect(files.length).toBeGreaterThanOrEqual(2)
  })

  it.each(
    files.map((f) => [path.relative(APP, f), f]),
  )('%s authorizes the actor itself and does not rely on the layout', (_name, file) => {
    expect(readFileSync(file, 'utf8')).toMatch(GUARD)
  })
})
