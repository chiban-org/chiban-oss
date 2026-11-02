import { readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name)
    if (statSync(full).isDirectory()) return sourceFiles(full)
    return /\.(ts|tsx)$/.test(name) && !/\.test\./.test(name) ? [full] : []
  })
}

const EXPORT =
  /^export\s+(?!async\s+function|type\s|interface\s|\{|\*)(const|function|class|let|var)\b/m

describe('use server modules', () => {
  it('export only async functions', () => {
    const offenders = sourceFiles(path.resolve(__dirname, '../app'))
      .filter((file) => /^['"]use server['"]/m.test(readFileSync(file, 'utf8')))
      .filter((file) => EXPORT.test(readFileSync(file, 'utf8')))
    expect(offenders).toEqual([])
  })
})
