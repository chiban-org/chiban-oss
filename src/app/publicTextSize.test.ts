import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const css = readFileSync(fileURLToPath(new URL('./globals.css', import.meta.url)), 'utf8')

function ruleBody(selector: string): string {
  const start = css.indexOf(selector)
  if (start === -1) return ''
  return css.slice(css.indexOf('{', start) + 1, css.indexOf('}', start))
}

const SRC = fileURLToPath(new URL('..', import.meta.url))
const PX_TEXT = /^text-\[(\d{1,2})px\]$/
const SMALL_NAMED = new Set(['text-sm', 'text-xs'])
const MIN_PX = 16

function isSmallToken(token: string): boolean {
  const utility = token.split(':').at(-1) ?? ''
  if (SMALL_NAMED.has(utility)) return true
  const px = PX_TEXT.exec(utility)
  return px !== null && Number(px[1]) < MIN_PX
}

const hasSmallText = (source: string) => source.split(/[\s"'`]+/).some(isSmallToken)

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) return sourceFiles(full)
    return /\.tsx$/.test(name) && !/\.test\./.test(name) ? [full] : []
  })
}

const SURFACES = [
  'app/(public)',
  'components/portal',
  'components/inspections',
  'app/(staff)/staff/inspections',
]

describe('public shell type size', () => {
  it('raises breakpoint-prefixed small utilities such as md:text-sm to the public minimum', () => {
    const body = ruleBody('.public-shell :is([class*=":text-sm"], [class*=":text-xs"])')
    expect(body).toContain('font-size: var(--public-min-body)')
  })

  it('uses no small text size in portal and inspector sources', () => {
    const offenders = SURFACES.flatMap((surface) => sourceFiles(join(SRC, surface)))
      .filter((file) => hasSmallText(readFileSync(file, 'utf8')))
      .map((file) => file.slice(SRC.length))
    expect(offenders).toEqual([])
  })

  it('raises the small utility sizes to the public minimum body size', () => {
    const body = ruleBody('.public-shell :is(.text-sm, .text-xs')
    expect(body).toContain('font-size: var(--public-min-body)')
  })

  it('does not lower the table size inside the public shell', () => {
    expect(css).not.toMatch(/\.public-shell[^{]*table[^{]*\{[^}]*0\.875rem/)
  })
})
