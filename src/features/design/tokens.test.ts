import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { contrastRatio, TOKENS } from '@/features/design/tokens'

const css = readFileSync(new URL('../../app/globals.css', import.meta.url), 'utf8')
const MIN_AA_TEXT = 4.5
const MIN_AA_NON_TEXT = 3

describe('design tokens', () => {
  it('holds the spec values exactly', () => {
    expect(TOKENS).toMatchObject({
      canvas: '#f1f5f8',
      surface: '#ffffff',
      ink: '#1f1f1f',
      'ink-secondary': '#2d2f33',
      muted: '#5b6470',
      action: '#2a65a3',
      highlight: '#fff7ca',
      'status-passed-fg': '#1e6b3a',
      'status-passed-bg': '#e6f4ea',
      'status-failed-fg': '#a3261f',
      'status-failed-bg': '#fbe9e7',
      'status-overdue-fg': '#7a4b00',
      'status-overdue-bg': '#fff7ca',
      'status-neutral-fg': '#2d2f33',
      'status-neutral-bg': '#e8edf1',
    })
  })

  it.each([
    ['ink', 'canvas'],
    ['ink-secondary', 'canvas'],
    ['muted', 'canvas'],
    ['muted', 'surface'],
    ['muted', 'sidebar'],
    ['ink-secondary', 'sidebar'],
    ['action', 'surface'],
    ['surface', 'action'],
    ['status-passed-fg', 'status-passed-bg'],
    ['status-failed-fg', 'status-failed-bg'],
    ['status-overdue-fg', 'status-overdue-bg'],
    ['status-neutral-fg', 'status-neutral-bg'],
  ] as const)('%s on %s meets 4.5:1', (fg, bg) => {
    expect(contrastRatio(TOKENS[fg], TOKENS[bg])).toBeGreaterThanOrEqual(MIN_AA_TEXT)
  })

  it.each([
    ['control-border', 'surface'],
    ['control-border', 'canvas'],
  ] as const)('%s on %s meets the 3:1 non-text minimum', (fg, bg) => {
    expect(contrastRatio(TOKENS[fg], TOKENS[bg])).toBeGreaterThanOrEqual(MIN_AA_NON_TEXT)
  })

  it('computes the WCAG formula', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 5)
    expect(contrastRatio('#ffffff', '#ffffff')).toBeCloseTo(1, 5)
  })

  it('declares every token in globals.css with the same value', () => {
    for (const [name, value] of Object.entries(TOKENS)) {
      expect(css).toContain(`--${name}: ${value};`)
    }
  })

  it('ties dark utilities to a class so an OS dark setting cannot restyle the light-only theme', () => {
    expect(css).toContain('@custom-variant dark (&:where(.dark, .dark *));')
  })

  it('declares shape and layout tokens', () => {
    expect(css).toContain('--radius: 10px;')
    expect(css).toContain('--space-base: 4px;')
    expect(css).toContain('--card-padding: 24px;')
    expect(css).toContain('--content-max-width: 1200px;')
  })
})
