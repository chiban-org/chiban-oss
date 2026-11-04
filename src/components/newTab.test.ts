import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { NEW_TAB } from './newTab'

const SRC = join(__dirname, '..')
const VIEWABLE_TARGET =
  /api\/documents\/|permit\.pdf|placard\.pdf|\/labels|\/letters|\/receipts\/|payments?\/receipt\/|\$\{base\}\//
const OPENING_TAG = /<(?:a|Link)\b(?:[^<>]|=>)*>/g

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) return sourceFiles(path)
    return /\.tsx$/.test(path) && !/\.test\.tsx$/.test(path) ? [path] : []
  })
}

describe('viewable document links', () => {
  it('opens in a new tab without leaking the opener', () => {
    expect(NEW_TAB).toEqual({ target: '_blank', rel: 'noopener noreferrer' })
  })

  it('spreads NEW_TAB on every link to a PDF or stored document', () => {
    const missing: string[] = []
    for (const file of sourceFiles(SRC)) {
      const text = readFileSync(file, 'utf8')
      for (const tag of text.match(OPENING_TAG) ?? []) {
        if (VIEWABLE_TARGET.test(tag) && !tag.includes('NEW_TAB')) missing.push(`${file}: ${tag}`)
      }
    }
    expect(missing).toEqual([])
  })
})
