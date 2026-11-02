import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const source = readFileSync(new URL('./route.ts', import.meta.url), 'utf8')

describe('webhook route', () => {
  it('reads the raw body text and never parses JSON before verification', () => {
    expect(source).toContain('request.text()')
    expect(source).not.toContain('request.json()')
    expect(source).not.toContain('formData()')
  })

  it('authenticates by signature instead of session or csrf', () => {
    expect(source).not.toContain('guardAction')
    expect(source).not.toContain('cookies(')
  })
})
