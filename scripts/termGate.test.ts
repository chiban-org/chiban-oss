import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { collectFiles, findTermHits, formatHit } from './termGate'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const TERM = 'Quillfeather'

function fixture(files: Record<string, string>): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'termgate-'))
  for (const [rel, content] of Object.entries(files)) {
    const full = path.join(dir, rel)
    mkdirSync(path.dirname(full), { recursive: true })
    writeFileSync(full, content)
  }
  return dir
}

describe('findTermHits', () => {
  it('reports path and line of each hit', () => {
    const dir = fixture({ 'a.ts': `ok\nline two ${TERM}\nok\n${TERM}` })
    const hits = findTermHits([path.join(dir, 'a.ts')], [TERM])
    expect(hits.map((h) => h.line)).toEqual([2, 4])
    expect(hits.every((h) => h.path.endsWith('a.ts'))).toBe(true)
  })

  it('matches case-insensitively', () => {
    const dir = fixture({ 'a.ts': TERM.toUpperCase() })
    expect(findTermHits([path.join(dir, 'a.ts')], [TERM.toLowerCase()])).toHaveLength(1)
  })

  it('never puts the term in the formatted output', () => {
    const dir = fixture({ 'a.ts': `x ${TERM}` })
    const [hit] = findTermHits([path.join(dir, 'a.ts')], [TERM])
    if (hit === undefined) throw new Error('expected a hit')
    const text = formatHit(hit)
    expect(text).toMatch(/a\.ts:1$/)
    expect(text.toLowerCase()).not.toContain(TERM.toLowerCase())
  })

  it('ignores blank terms', () => {
    const dir = fixture({ 'a.ts': 'anything' })
    expect(findTermHits([path.join(dir, 'a.ts')], ['', '   '])).toEqual([])
  })
})

describe('collectFiles', () => {
  it('skips node_modules, .git, and .next', () => {
    const dir = fixture({
      'src/keep.ts': 'x',
      'node_modules/pkg/index.js': 'x',
      '.git/config': 'x',
      '.next/build.js': 'x',
    })
    const rel = collectFiles(dir).map((f) => path.relative(dir, f))
    expect(rel).toEqual(['src/keep.ts'])
  })
})

describe('term gate CLI', () => {
  function run(dir: string, termsFile: string | null) {
    const env: NodeJS.ProcessEnv = { ...process.env, CHIBAN_TERMS_FILE: termsFile ?? undefined }
    return spawnSync(
      process.execPath,
      ['--import', 'tsx', path.join(ROOT, 'scripts/termGate.ts'), dir],
      {
        cwd: ROOT,
        env,
        encoding: 'utf8',
      },
    )
  }

  it('exits 1 on a hit and prints path:line only', () => {
    const dir = fixture({ 'src/a.ts': `a\n${TERM}` })
    const terms = path.join(fixture({ 'terms.txt': `${TERM}\n` }), 'terms.txt')
    const result = run(dir, terms)
    expect(result.status).toBe(1)
    expect(result.stdout).toContain('src/a.ts:2')
    expect((result.stdout + result.stderr).toLowerCase()).not.toContain(TERM.toLowerCase())
  })

  it('exits 0 when nothing matches', () => {
    const dir = fixture({ 'src/a.ts': 'clean' })
    const terms = path.join(fixture({ 'terms.txt': `${TERM}\n` }), 'terms.txt')
    expect(run(dir, terms).status).toBe(0)
  })

  it('exits 0 with a warning when CHIBAN_TERMS_FILE is unset', () => {
    const dir = fixture({ 'src/a.ts': TERM })
    const result = run(dir, null)
    expect(result.status).toBe(0)
    expect(result.stderr).toContain('CHIBAN_TERMS_FILE')
  })
})
