import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { GENERATED_PAGES } from './pages'

const ROOT = fileURLToPath(new URL('../..', import.meta.url))

describe('generated documentation pages', () => {
  it.each(
    GENERATED_PAGES.map((page) => [page.path, page] as const),
  )('%s matches what pnpm docs:generate writes', (relative, page) => {
    const target = path.join(ROOT, relative)
    expect(existsSync(target), `${relative} is missing; run pnpm docs:generate`).toBe(true)
    expect(readFileSync(target, 'utf8'), `${relative} is stale; run pnpm docs:generate`).toBe(
      page.render(),
    )
  })

  it('marks every generated page as generated in its front matter', () => {
    for (const page of GENERATED_PAGES) {
      const text = page.render()
      expect(text.startsWith('---\n'), page.path).toBe(true)
      expect(text.split('\n---\n')[0], page.path).toContain('generated: true')
    }
  })

  it('renders the same text twice', () => {
    for (const page of GENERATED_PAGES) expect(page.render(), page.path).toBe(page.render())
  })
})
