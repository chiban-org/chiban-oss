import { describe, expect, it } from 'vitest'
import {
  CSV_BOM,
  cellText,
  clampForExcel,
  csvField,
  csvLine,
  safeForSpreadsheet,
} from '@/features/export/tabular/cells'

describe('cellText', () => {
  it('writes null and undefined as empty cells', () => {
    expect(cellText(null)).toBe('')
    expect(cellText(undefined)).toBe('')
  })

  it('writes scalars as plain text and booleans as true or false', () => {
    expect(cellText('Main St')).toBe('Main St')
    expect(cellText(12.5)).toBe('12.5')
    expect(cellText(false)).toBe('false')
  })

  it('writes objects and lists as canonical JSON text', () => {
    expect(cellText({ b: 1, a: [2, 3] })).toBe('{"a":[2,3],"b":1}')
    expect(cellText(['x', 'y'])).toBe('["x","y"]')
  })
})

describe('csv encoding', () => {
  it('quotes fields holding commas, quotes, and line breaks', () => {
    expect(csvField('plain')).toBe('plain')
    expect(csvField('a,b')).toBe('"a,b"')
    expect(csvField('say "hi"')).toBe('"say ""hi"""')
    expect(csvField('one\ntwo')).toBe('"one\ntwo"')
  })

  it('ends each line with CR LF', () => {
    expect(csvLine(['a', 'b,c'])).toBe('a,"b,c"\r\n')
  })

  it('uses a UTF-8 byte order mark', () => {
    expect(Buffer.from(CSV_BOM, 'utf8')).toEqual(Buffer.from([0xef, 0xbb, 0xbf]))
  })
})

describe('spreadsheet safety', () => {
  it('prefixes text that would start a formula', () => {
    for (const text of ['=SUM(A1)', '+1', '-1', '@cmd', '\tx']) {
      expect(safeForSpreadsheet(text)).toBe(`'${text}`)
    }
    expect(safeForSpreadsheet('2026-01-01')).toBe('2026-01-01')
  })

  it('cuts text longer than an Excel cell holds', () => {
    expect(clampForExcel('x'.repeat(40_000))).toHaveLength(32_767)
    expect(clampForExcel('short')).toBe('short')
  })
})
