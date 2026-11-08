import { stream } from 'exceljs'
import { clampForExcel } from '@/features/export/tabular/cells'

export const EXCEL_MAX_ROWS = 1_048_576
const SHEET_NAME_LIMIT = 31
const INVALID_SHEET_CHARS = /[\\/?*[\]:]/g

export interface SheetRecord {
  entity: string
  name: string
  rows: number
}

export interface WorkbookBuilder {
  startEntity(entity: string, columns: string[]): void
  addRow(texts: string[]): void
  finishEntity(): void
  close(): Promise<SheetRecord[]>
}

type Writer = InstanceType<typeof stream.xlsx.WorkbookWriter>
type Sheet = ReturnType<Writer['addWorksheet']>

interface Current {
  entity: string
  columns: string[]
  part: number
  rows: number
  sheet: Sheet
}

export function sheetName(base: string, part: number, taken: Set<string>): string {
  const clean = base.replace(INVALID_SHEET_CHARS, '_')
  const suffix = part === 1 ? '' : `_${part}`
  let candidate = `${clean.slice(0, SHEET_NAME_LIMIT - suffix.length)}${suffix}`
  for (let n = 2; taken.has(candidate.toLowerCase()); n += 1) {
    const tail = `${suffix}~${n}`
    candidate = `${clean.slice(0, SHEET_NAME_LIMIT - tail.length)}${tail}`
  }
  taken.add(candidate.toLowerCase())
  return candidate
}

export function createWorkbookBuilder(filename: string, maxRows = EXCEL_MAX_ROWS): WorkbookBuilder {
  const writer: Writer = new stream.xlsx.WorkbookWriter({
    filename,
    useStyles: false,
    useSharedStrings: false,
  })
  const taken = new Set<string>()
  const records: SheetRecord[] = []
  let current: Current | null = null

  function openSheet(entity: string, columns: string[], part: number): Current {
    const name = sheetName(entity, part, taken)
    const sheet = writer.addWorksheet(name)
    sheet.addRow(columns).commit()
    records.push({ entity, name, rows: 0 })
    return { entity, columns, part, rows: 0, sheet }
  }

  function closeSheet(): void {
    if (current === null) return
    const last = records.at(-1)
    if (last !== undefined) last.rows = current.rows
    current.sheet.commit()
    current = null
  }

  return {
    startEntity(entity, columns) {
      current = openSheet(entity, columns, 1)
    },
    addRow(texts) {
      if (current === null) return
      if (current.rows + 1 >= maxRows) {
        const { entity, columns, part } = current
        closeSheet()
        current = openSheet(entity, columns, part + 1)
      }
      current.sheet.addRow(texts.map(clampForExcel)).commit()
      current.rows += 1
    },
    finishEntity: closeSheet,
    async close() {
      closeSheet()
      await writer.commit()
      return records
    },
  }
}
