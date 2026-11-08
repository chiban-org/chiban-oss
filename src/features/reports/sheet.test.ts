import ExcelJS from 'exceljs'
import { describe, expect, it } from 'vitest'
import { type SheetCell, sheetCsv, sheetXlsx } from '@/features/reports/sheet'

const ROWS: SheetCell[][] = [
  ['Type', 'Issued', 'Median days', 'Fees', 'Note'],
  ['Building, new', 3, { decimal: 2, places: 1 }, { cents: -123_456 }, null],
]

async function readBack(bytes: Buffer): Promise<ExcelJS.Worksheet> {
  const book = new ExcelJS.Workbook()
  await book.xlsx.load(bytes as unknown as ExcelJS.Buffer)
  const sheet = book.worksheets[0]
  if (sheet === undefined) throw new Error('no sheet')
  return sheet
}

describe('sheetCsv', () => {
  it('writes numbers, fixed decimals, dollars and blanks the way the CSV exports always have', () => {
    expect(sheetCsv(ROWS)).toBe(
      'Type,Issued,Median days,Fees,Note\r\n"Building, new",3,2.0,-1234.56,\r\n',
    )
  })
})

describe('sheetXlsx', () => {
  it('keeps counts, days and dollars as numbers Excel can add up', async () => {
    const sheet = await readBack(await sheetXlsx({ title: 'Processing time', rows: ROWS }))
    expect(sheet.name).toBe('Processing time')
    const row = sheet.getRow(2)
    expect(row.getCell(1).value).toBe('Building, new')
    expect(row.getCell(2).value).toBe(3)
    expect(row.getCell(3).value).toBe(2)
    expect(row.getCell(3).numFmt).toBe('0.0')
    expect(row.getCell(4).value).toBe(-1234.56)
    expect(row.getCell(4).numFmt).toBe('#,##0.00')
    expect(row.getCell(5).value).toBeNull()
    expect(sheet.getRow(1).getCell(1).font.bold).toBe(true)
  })

  it('makes a sheet name Excel accepts from any title', async () => {
    const sheet = await readBack(
      await sheetXlsx({ title: 'Cash receipts: 2026/11/01 to 2026/11/07 [weekly]', rows: ROWS }),
    )
    expect(sheet.name).toBe('Cash receipts 20261101 to 20261')
  })
})
