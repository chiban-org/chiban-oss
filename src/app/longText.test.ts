import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const css = readFileSync(fileURLToPath(new URL('./components.css', import.meta.url)), 'utf8')

function ruleBody(selector: string): string {
  const start = css.indexOf(`${selector} {`)
  if (start === -1) return ''
  return css.slice(css.indexOf('{', start) + 1, css.indexOf('}', start))
}

describe('long unbroken text in the staff and public pages', () => {
  it('breaks anywhere inside a table cell so one long value cannot widen the page', () => {
    expect(ruleBody(':where(main) :where(td)')).toContain('overflow-wrap: anywhere;')
  })

  it('breaks an overlong word anywhere else in main instead of overflowing its box', () => {
    expect(ruleBody(':where(main)')).toContain('overflow-wrap: break-word;')
  })
})
