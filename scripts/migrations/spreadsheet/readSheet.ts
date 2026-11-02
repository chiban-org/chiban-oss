import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { parse } from 'csv-parse/sync'
import ExcelJS from 'exceljs'
import { z } from 'zod'
import { err, ok, type Result } from '@/types/result'
import { mappedSheetColumns, type SpreadsheetMapping } from './mapping'

export type Cell = string | number | Date

export interface SheetRow {
  row: number
  cells: ReadonlyMap<string, Cell>
}

export interface SheetData {
  sha256: string
  sheet: string
  rows: SheetRow[]
}

export type ReadError =
  | { kind: 'unreadable'; detail: string }
  | { kind: 'unsupported_file'; detail: string }
  | { kind: 'no_such_sheet'; detail: string }
  | { kind: 'missing_columns'; detail: string }

const cellSchema = z.union([z.string(), z.number().finite(), z.date()])

const CSV_SHEET = 'csv'

function plainCell(value: ExcelJS.CellValue): unknown {
  if (value === null || value === undefined) return null
  if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE'
  if (typeof value !== 'object' || value instanceof Date) return value
  if ('richText' in value) return value.richText.map((r) => r.text).join('')
  if ('result' in value) return plainCell(value.result)
  if ('text' in value) return String(value.text)
  return null
}

function toCell(value: unknown): Cell | null {
  const parsed = cellSchema.safeParse(typeof value === 'string' ? value.trim() : value)
  if (!parsed.success) return null
  return parsed.data === '' ? null : parsed.data
}

function collect(
  grid: { row: number; values: unknown[] }[],
  mapping: SpreadsheetMapping,
): Result<SheetRow[], ReadError> {
  const header = grid.find((g) => g.row === mapping.headerRow)
  const names = (header?.values ?? []).map((v) => String(toCell(v) ?? '').trim())
  const missing = mappedSheetColumns(mapping).filter((c) => !names.includes(c))
  if (missing.length > 0) {
    return err({ kind: 'missing_columns', detail: `No column named ${missing.join(', ')}` })
  }
  const rows: SheetRow[] = []
  for (const line of grid.filter((g) => g.row > mapping.headerRow)) {
    const cells = new Map<string, Cell>()
    names.forEach((name, i) => {
      const cell = toCell(line.values[i])
      if (name !== '' && cell !== null) cells.set(name, cell)
    })
    if (cells.size > 0) rows.push({ row: line.row, cells })
  }
  return ok(rows)
}

async function readWorkbook(
  bytes: Buffer,
  mapping: SpreadsheetMapping,
): Promise<Result<{ sheet: string; rows: SheetRow[] }, ReadError>> {
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.load(bytes as unknown as ExcelJS.Buffer)
  const worksheet =
    mapping.sheet === undefined ? workbook.worksheets[0] : workbook.getWorksheet(mapping.sheet)
  if (worksheet === undefined) {
    return err({ kind: 'no_such_sheet', detail: `No sheet named ${mapping.sheet ?? '(first)'}` })
  }
  const grid: { row: number; values: unknown[] }[] = []
  worksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    const values = Array.from({ length: row.cellCount }, (_, i) =>
      plainCell(row.getCell(i + 1).value),
    )
    grid.push({ row: rowNumber, values })
  })
  const rows = collect(grid, mapping)
  return rows.ok ? ok({ sheet: worksheet.name, rows: rows.value }) : rows
}

function readCsv(
  bytes: Buffer,
  mapping: SpreadsheetMapping,
): Result<{ sheet: string; rows: SheetRow[] }, ReadError> {
  const lines = parse(bytes, {
    bom: true,
    relax_column_count: true,
    skip_empty_lines: false,
  }) as string[][]
  const rows = collect(
    lines.map((values, i) => ({ row: i + 1, values })),
    mapping,
  )
  return rows.ok ? ok({ sheet: CSV_SHEET, rows: rows.value }) : rows
}

export async function readSheet(
  filePath: string,
  mapping: SpreadsheetMapping,
  signal: AbortSignal,
): Promise<Result<SheetData, ReadError>> {
  signal.throwIfAborted()
  const extension = path.extname(filePath).toLowerCase()
  if (extension !== '.xlsx' && extension !== '.csv') {
    return err({ kind: 'unsupported_file', detail: 'Only .xlsx and .csv files can be read' })
  }
  try {
    const bytes = await readFile(filePath, { signal })
    const sha256 = createHash('sha256').update(bytes).digest('hex')
    const read =
      extension === '.xlsx' ? await readWorkbook(bytes, mapping) : readCsv(bytes, mapping)
    return read.ok ? ok({ sha256, ...read.value }) : read
  } catch (e) {
    signal.throwIfAborted()
    return err({ kind: 'unreadable', detail: e instanceof Error ? e.message : 'Unreadable file' })
  }
}
