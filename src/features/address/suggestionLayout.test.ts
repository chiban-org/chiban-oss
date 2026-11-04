import { describe, expect, it } from 'vitest'
import { fitLines, toSingleLine, toTextBlock } from '@/features/address/suggestionLayout'

const lines = ['Land Use Office', '1 MAIN ST', 'ALDER POND NH 03000-1234']

describe('suggestion layout', () => {
  it('joins the lines with commas for a one-line field', () => {
    expect(toSingleLine(lines)).toBe('Land Use Office, 1 MAIN ST, ALDER POND NH 03000-1234')
  })

  it('joins the lines with line breaks for a box', () => {
    expect(toTextBlock(lines)).toBe('Land Use Office\n1 MAIN ST\nALDER POND NH 03000-1234')
  })

  it('keeps the lines when they fit and folds the front lines together when they do not', () => {
    expect(fitLines(lines, 3)).toEqual(lines)
    expect(fitLines(lines, 2)).toEqual(['Land Use Office, 1 MAIN ST', 'ALDER POND NH 03000-1234'])
    expect(fitLines(['A', ...lines], 3)).toEqual([
      'A, Land Use Office',
      '1 MAIN ST',
      'ALDER POND NH 03000-1234',
    ])
  })
})
