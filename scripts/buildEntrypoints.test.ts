import { execFileSync } from 'node:child_process'
import { mkdtempSync, readdirSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const ROOT = path.resolve(import.meta.dirname, '..')
const ENTRYPOINT_DIR = path.join(ROOT, 'src', 'entrypoints')

function sourceNames(): string[] {
  return readdirSync(ENTRYPOINT_DIR)
    .filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts'))
    .map((f) => f.replace(/\.ts$/, ''))
}

function kebab(name: string): string {
  return name.replaceAll(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase()
}

describe('buildEntrypoints', () => {
  const outDir = mkdtempSync(path.join(tmpdir(), 'chiban-entrypoints-'))

  it('bundles every entrypoint into a kebab-case .mjs', () => {
    execFileSync('node', ['scripts/buildEntrypoints.mjs', outDir], { cwd: ROOT, stdio: 'pipe' })
    const produced = readdirSync(outDir)
      .filter((f) => f.endsWith('.mjs'))
      .sort()
    expect(produced).toEqual(
      sourceNames()
        .map((n) => `${kebab(n)}.mjs`)
        .sort(),
    )
    for (const expected of [
      'import-archive.mjs',
      'import-from-target.mjs',
      'chiban-recover.mjs',
      'town-service-status.mjs',
      'worker.mjs',
      'migrate.mjs',
      'export-format-doc.mjs',
      'demo-reset.mjs',
      'create-staff-user.mjs',
    ]) {
      expect(produced).toContain(expected)
    }
  }, 120_000)

  it('keeps packages external and resolves path aliases', () => {
    const worker = readFileSync(path.join(outDir, 'worker.mjs'), 'utf8')
    expect(worker).toMatch(/from ["']pg-boss["']/)
    expect(worker).not.toMatch(/from ["']@\//)
  })

  it('ships the demo seed fixtures beside the bundles that read them', () => {
    const shipped = readdirSync(path.join(outDir, 'fixtures')).sort()
    const source = readdirSync(path.join(ROOT, 'src', 'features', 'demo', 'fixtures')).sort()
    expect(shipped).toEqual(source)
    const reset = readFileSync(path.join(outDir, 'demo-reset.mjs'), 'utf8')
    expect(reset).toContain('./fixtures/')
  })
})
