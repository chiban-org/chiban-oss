import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'

const ROOT = join(import.meta.dirname, '..', '..', '..')
const SCANNED = ['src/features', 'src/jobs']
const DEMO_TOWN = 'Alder Pond'

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) return name === 'demo' ? [] : sourceFiles(path)
    return /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : []
  })
}

function buildsOutgoingMessage(source: string): boolean {
  return (
    source.includes('@/features/mail/transport') ||
    source.includes('BEGIN:VCALENDAR') ||
    (source.includes('subject') && source.includes('html'))
  )
}

describe('outgoing message builders', () => {
  it('never name the demo town outside demo and test code', () => {
    const builders = SCANNED.flatMap((dir) => sourceFiles(join(ROOT, dir))).filter((path) =>
      buildsOutgoingMessage(readFileSync(path, 'utf8')),
    )
    expect(builders.length).toBeGreaterThan(5)
    const leaks = builders
      .filter((path) => readFileSync(path, 'utf8').includes(DEMO_TOWN))
      .map((path) => relative(ROOT, path))
    expect(leaks).toEqual([])
  })
})
