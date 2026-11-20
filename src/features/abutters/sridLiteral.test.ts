import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const ROOT = path.resolve(__dirname, '../../..')
const SCANNED_DIRS = ['src/features/abutters', 'src/features/boards']
const TEST_FILE = /\.test\.tsx?$/
const SOURCE_FILE = /\.tsx?$/
const SRID_LITERAL = /\b3437\b/

function sourceFiles(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
    const rel = `${dir}/${entry.name}`
    if (entry.isDirectory()) sourceFiles(rel, acc)
    else if (SOURCE_FILE.test(entry.name) && !TEST_FILE.test(entry.name)) acc.push(rel)
  }
  return acc
}

function sridHits(): string[] {
  return SCANNED_DIRS.flatMap((dir) => sourceFiles(dir)).flatMap((rel) =>
    readFileSync(path.join(ROOT, rel), 'utf8')
      .split('\n')
      .flatMap((line, i) => (SRID_LITERAL.test(line) ? [`${rel}:${i + 1}: ${line.trim()}`] : [])),
  )
}

describe('projected SRID literal', () => {
  it('no abutter or board file hardcodes the New Hampshire SRID', () => {
    expect(sridHits()).toEqual([])
  })

  it('detects a bare SRID', () => {
    expect(SRID_LITERAL.test('ST_Transform(p.geom, 3437)')).toBe(true)
    expect(SRID_LITERAL.test('const n = 34370')).toBe(false)
  })
})
