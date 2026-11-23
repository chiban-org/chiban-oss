import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { packById, withPackForTest } from '@/features/packs/registry'
import { XX_PACK } from '@/test/packs/xx'
import { generatedPages } from './pages'
import { renderStarterCatalog } from './starterCatalog'
import { renderClocks } from './stateDeadlines'

const ROOT = fileURLToPath(new URL('../..', import.meta.url))

const STATE_PAGE_NAMES = ['clocks.md', 'holidays.md', 'other-rules.md', 'starters.md']

describe('generated documentation pages', () => {
  it.each(
    generatedPages().map((page) => [page.path, page] as const),
  )('%s matches what pnpm docs:generate writes', (relative, page) => {
    const target = path.join(ROOT, relative)
    expect(existsSync(target), `${relative} is missing; run pnpm docs:generate`).toBe(true)
    expect(readFileSync(target, 'utf8'), `${relative} is stale; run pnpm docs:generate`).toBe(
      page.render(),
    )
  })

  it('marks every generated page as generated in its front matter', () => {
    for (const page of generatedPages()) {
      const text = page.render()
      expect(text.startsWith('---\n'), page.path).toBe(true)
      expect(text.split('\n---\n')[0], page.path).toContain('generated: true')
    }
  })

  it('renders the same text twice', () => {
    for (const page of generatedPages()) expect(page.render(), page.path).toBe(page.render())
  })

  it.each(
    withPackForTest(packById('me'), () =>
      generatedPages()
        .filter((page) => page.path.includes('/state-packs/'))
        .map((page) => [page.path] as const),
    ),
  )('%s matches what CHIBAN_PACK=me pnpm docs:generate writes', (relative) => {
    const target = path.join(ROOT, relative)
    expect(
      existsSync(target),
      `${relative} is missing; run CHIBAN_PACK=me pnpm docs:generate`,
    ).toBe(true)
    const rendered = withPackForTest(packById('me'), () =>
      generatedPages()
        .find((page) => page.path === relative)
        ?.render(),
    )
    expect(
      readFileSync(target, 'utf8'),
      `${relative} is stale; run CHIBAN_PACK=me pnpm docs:generate`,
    ).toBe(rendered)
  })

  it('lists the plumbing inspector starters in their own group and not with local permits', () => {
    const catalog = withPackForTest(packById('me'), () => renderStarterCatalog())
    const groups = catalog.split('\n## ')
    const body = (title: string) => groups.find((block) => block.startsWith(`${title}\n`)) ?? ''
    expect(body('Plumbing permits')).not.toBe('')
    for (const label of [
      'Internal plumbing permit',
      'Subsurface wastewater disposal permit',
      'Seasonal dwelling conversion permit',
    ]) {
      expect(body('Plumbing permits'), label).toContain(`### ${label}\n`)
      expect(body('Local permits and registrations'), label).not.toContain(`### ${label}\n`)
    }
  })

  it('has no plumbing group for a pack whose plumbing inspector owns nothing', () => {
    expect(renderStarterCatalog()).not.toContain('## Plumbing permits')
  })

  it('keeps the capitals inside a town setting label on the clocks page', () => {
    const clocks = withPackForTest(packById('me'), () => renderClocks())
    expect(clocks).toContain('(Chiban starting value)')
    expect(clocks).toContain('the DEP Chapter 1000 guideline ordinance')
    expect(clocks).toContain('a Board of Appeals hearing')
    expect(clocks).not.toContain('chiban starting value')
  })

  it('writes the active pack state pages under its docs folder and cites its own sources', () => {
    withPackForTest(XX_PACK, () => {
      const state = generatedPages().filter((page) => page.path.includes('/state-packs/'))
      expect(state.map((page) => path.basename(page.path)).sort()).toEqual(STATE_PAGE_NAMES)
      for (const page of state) {
        expect(page.path.startsWith('docs-site/docs/state-packs/xx/_generated/'), page.path).toBe(
          true,
        )
        const sources = page
          .render()
          .split('\n---\n')
          .slice(0, 1)
          .join('')
          .split('\n')
          .filter((line) => line.startsWith('  - '))
          .filter((line) => !line.includes('"src/'))
        expect(sources.length, page.path).toBeGreaterThan(0)
        for (const line of sources) expect(line.startsWith('  - "packs/xx/'), line).toBe(true)
      }
    })
  })
})
