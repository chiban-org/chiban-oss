import { existsSync, readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const ROOT = path.resolve(import.meta.dirname, '../../..')
const SRC = path.join(ROOT, 'src')
const USPS_DIR = path.join(SRC, 'features', 'usps')
const ENV_FILE = path.join(SRC, 'config', 'env.ts')
const IMPORT =
  /(?:^|\n)\s*(?:import|export)\s(?!type\s)[^'"]*?from\s+['"]([^'"]+)['"]|(?:^|\n)\s*import\s+['"]([^'"]+)['"]/g

function walk(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) walk(full, acc)
    else if (/\.tsx?$/.test(entry.name)) acc.push(full)
  }
  return acc
}

function directive(source: string): string | null {
  const first = /^\s*['"](use client|use server)['"]/.exec(source)
  return first?.[1] ?? null
}

function resolveImport(from: string, specifier: string): string | null {
  let base: string
  if (specifier.startsWith('@/')) base = path.join(SRC, specifier.slice(2))
  else if (specifier.startsWith('@packs/')) base = path.join(ROOT, 'packs', specifier.slice(7))
  else if (specifier.startsWith('.')) base = path.resolve(path.dirname(from), specifier)
  else return null
  const candidates = [base, `${base}.ts`, `${base}.tsx`, `${base}/index.ts`, `${base}/index.tsx`]
  return candidates.find((c) => existsSync(c) && /\.tsx?$/.test(c)) ?? null
}

function reachableFromClient(): Set<string> {
  const files = walk(SRC).filter((f) => !/\.test\.tsx?$/.test(f))
  const queue = files.filter((f) => directive(readFileSync(f, 'utf8')) === 'use client')
  const seen = new Set<string>(queue)
  while (queue.length > 0) {
    const file = queue.pop() ?? ''
    const source = readFileSync(file, 'utf8')
    if (directive(source) === 'use server') continue
    for (const match of source.matchAll(IMPORT)) {
      const target = resolveImport(file, match[1] ?? match[2] ?? '')
      if (target === null || seen.has(target)) continue
      seen.add(target)
      queue.push(target)
    }
  }
  return seen
}

describe('USPS credentials stay on the server', () => {
  const reached = reachableFromClient()

  it('finds the client components that check addresses', () => {
    expect(reached).toContain(path.join(SRC, 'server', 'suggestAddress.ts'))
  })

  it('no client component imports the USPS client or the environment, even indirectly', () => {
    const leaks = [...reached].filter((f) => f.startsWith(USPS_DIR) || f === ENV_FILE)
    expect(leaks.map((f) => path.relative(ROOT, f))).toEqual([])
  })

  it('names the credentials only in the environment schema and the lookup choice', () => {
    const naming = walk(SRC)
      .filter((f) => !/\.test\.tsx?$/.test(f))
      .filter((f) => /USPS_CLIENT_(ID|SECRET)/.test(readFileSync(f, 'utf8')))
      .map((f) => path.relative(ROOT, f))
      .sort()
    expect(naming).toEqual(['src/config/env.ts', 'src/features/usps/chooseLookup.ts'])
  })
})
