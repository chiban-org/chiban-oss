import ExcelJS from 'exceljs'
import { dollars, toCsvRows } from '@/features/reports/csv'

export type SheetCell =
  | string
  | number
  | null
  | { cents: number }
  | { decimal: number; places: number }

export interface ReportSheet {
  title: string
  rows: SheetCell[][]
}

const CENTS_PER_DOLLAR = 100
const MONEY_FORMAT = '#,##0.00'
const MAX_SHEET_NAME = 31
const SHEET_NAME_FORBIDDEN = /[[\]:*?/\\]/g

function csvText(cell: SheetCell): string {
  if (cell === null) return ''
  if (typeof cell === 'string') return cell
  if (typeof cell === 'number') return String(cell)
  if ('cents' in cell) return dollars(cell.cents)
  return cell.decimal.toFixed(cell.places)
}

export function sheetCsv(rows: readonly SheetCell[][]): string {
  return toCsvRows(rows.map((row) => row.map(csvText)))
}

function sheetName(title: string): string {
  const cleaned = title.replaceAll(SHEET_NAME_FORBIDDEN, '').replaceAll(/\s+/g, ' ').trim()
  return cleaned.slice(0, MAX_SHEET_NAME).trim() || 'Report'
}

function writeCell(target: ExcelJS.Cell, cell: SheetCell): void {
  if (cell === null || typeof cell !== 'object') {
    target.value = cell
    return
  }
  if ('cents' in cell) {
    target.value = cell.cents / CENTS_PER_DOLLAR
    target.numFmt = MONEY_FORMAT
    return
  }
  target.value = cell.decimal
  target.numFmt = cell.places === 0 ? '0' : `0.${'0'.repeat(cell.places)}`
}

export async function sheetXlsx(sheet: ReportSheet): Promise<Buffer> {
  const book = new ExcelJS.Workbook()
  const worksheet = book.addWorksheet(sheetName(sheet.title))
  sheet.rows.forEach((cells, index) => {
    const row = worksheet.getRow(index + 1)
    cells.forEach((cell, column) => {
      writeCell(row.getCell(column + 1), cell)
    })
    if (index === 0) row.font = { bold: true }
    row.commit()
  })
  return Buffer.from(await book.xlsx.writeBuffer())
}
