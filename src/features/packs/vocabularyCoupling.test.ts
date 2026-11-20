import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const ROOT = path.resolve(__dirname, '../../..')
const SCANNED_DIRS = ['src']
const ALLOWED_PREFIXES = ['src/test/', 'src/features/demo/', 'src/features/packs/probes/']
const TEST_FILE = /\.test\.tsx?$/
const SOURCE_FILE = /\.tsx?$/
const STATE_VOCABULARY = /Right-to-Know|Right to Know|\bZBA\b|Zoning Board|selectmen/
const STORED_IDENTIFIERS =
  /selectmenCertifications|selectmen_certifications?|certified_by_selectmen/g

function sourceFiles(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
    const rel = `${dir}/${entry.name}`
    if (entry.isDirectory()) sourceFiles(rel, acc)
    else if (SOURCE_FILE.test(entry.name)) acc.push(rel)
  }
  return acc
}

function scanned(rel: string): boolean {
  if (TEST_FILE.test(rel)) return false
  return !ALLOWED_PREFIXES.some((prefix) => rel.startsWith(prefix))
}

function vocabularyHits(): string[] {
  return SCANNED_DIRS.flatMap((dir) => sourceFiles(dir))
    .filter(scanned)
    .flatMap((rel) =>
      readFileSync(path.join(ROOT, rel), 'utf8')
        .split('\n')
        .flatMap((line, i) =>
          STATE_VOCABULARY.test(line.replace(STORED_IDENTIFIERS, ''))
            ? [`${rel}:${i + 1}: ${line.trim()}`]
            : [],
        ),
    )
}

describe('engine vocabulary comes from the pack', () => {
  it('no engine file spells a state term in screen copy', () => {
    expect(vocabularyHits()).toEqual([])
  })

  it('detects each state term', () => {
    expect(STATE_VOCABULARY.test('Right-to-Know request')).toBe(true)
    expect(STATE_VOCABULARY.test('the Right to Know law')).toBe(true)
    expect(STATE_VOCABULARY.test('the ZBA')).toBe(true)
    expect(STATE_VOCABULARY.test('Zoning Board of Adjustment')).toBe(true)
    expect(STATE_VOCABULARY.test('the selectmen')).toBe(true)
    expect(STATE_VOCABULARY.test('ZBAs and zbaDecision')).toBe(false)
  })

  it('lets the stored identifiers through and nothing else', () => {
    const stripped = (line: string) => line.replace(STORED_IDENTIFIERS, '')
    expect(STATE_VOCABULARY.test(stripped('.from(selectmenCertifications)'))).toBe(false)
    expect(STATE_VOCABULARY.test(stripped("'selectmen_certifications'"))).toBe(false)
    expect(STATE_VOCABULARY.test(stripped("substep: 'certified_by_selectmen'"))).toBe(false)
    expect(STATE_VOCABULARY.test(stripped('Certified by the selectmen'))).toBe(true)
  })
})
