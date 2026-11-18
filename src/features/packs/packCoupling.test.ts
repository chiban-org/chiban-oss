import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const ROOT = path.resolve(__dirname, '../../..')
const SCANNED_DIRS = ['src', 'scripts']

const ALLOWED_FILES = new Set([
  'src/features/packs/registry.ts',
  'src/features/packs/registryAbutters.ts',
])
const ALLOWED_PREFIXES = ['src/test/', 'src/features/demo/', 'src/features/packs/probes/']
const TEST_FILE = /\.test\.tsx?$/
const SOURCE_FILE = /\.tsx?$/
const NH_IMPORT = /['"]@packs\/nh[/'"]/
const NH_KEY_LITERAL = /['"`]nh\./

function sourceFiles(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
    const rel = `${dir}/${entry.name}`
    if (entry.isDirectory()) sourceFiles(rel, acc)
    else if (SOURCE_FILE.test(entry.name)) acc.push(rel)
  }
  return acc
}

function scanned(rel: string): boolean {
  if (ALLOWED_FILES.has(rel) || TEST_FILE.test(rel)) return false
  return !ALLOWED_PREFIXES.some((prefix) => rel.startsWith(prefix))
}

function couplingHits(): string[] {
  return SCANNED_DIRS.flatMap((dir) => sourceFiles(dir))
    .filter(scanned)
    .flatMap((rel) => {
      const text = readFileSync(path.join(ROOT, rel), 'utf8')
      return text
        .split('\n')
        .flatMap((line, i) =>
          NH_IMPORT.test(line) || NH_KEY_LITERAL.test(line)
            ? [`${rel}:${i + 1}: ${line.trim()}`]
            : [],
        )
    })
}

describe('engine coupling to the New Hampshire pack', () => {
  it('no engine file imports @packs/nh or names an nh. key', () => {
    expect(couplingHits()).toEqual([])
  })

  it('detects an import and a key literal', () => {
    expect(NH_IMPORT.test(`import { X } from '@packs/nh/manifest'`)).toBe(true)
    expect(NH_IMPORT.test(`import '@packs/nh'`)).toBe(true)
    expect(NH_KEY_LITERAL.test("const k = 'nh.bp.decision'")).toBe(true)
    expect(NH_KEY_LITERAL.test('const k = `nh.${suffix}`')).toBe(true)
    expect(NH_KEY_LITERAL.test("const k = 'xx.bp.decision'")).toBe(false)
  })
})
