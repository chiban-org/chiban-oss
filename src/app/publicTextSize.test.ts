import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const css = readFileSync(fileURLToPath(new URL('./globals.css', import.meta.url)), 'utf8')

function ruleBody(selector: string): string {
  const start = css.indexOf(selector)
  if (start === -1) return ''
  return css.slice(css.indexOf('{', start) + 1, css.indexOf('}', start))
}

describe('public shell type size', () => {
  it('raises the small utility sizes to the public minimum body size', () => {
    const body = ruleBody('.public-shell :is(.text-sm, .text-xs')
    expect(body).toContain('font-size: var(--public-min-body)')
  })

  it('does not lower the table size inside the public shell', () => {
    expect(css).not.toMatch(/\.public-shell[^{]*table[^{]*\{[^}]*0\.875rem/)
  })
})
