import { createHash } from 'node:crypto'
import { once } from 'node:events'
import { createWriteStream } from 'node:fs'
import { join } from 'node:path'
import type { ExportEntity } from '@/features/export/entities'
import { CSV_BOM, cellText, csvLine, safeForSpreadsheet } from '@/features/export/tabular/cells'
import { entityColumns } from '@/features/export/tabular/columns'
import {
  createWorkbookBuilder,
  type SheetRecord,
  type WorkbookBuilder,
} from '@/features/export/tabular/workbook'

export interface EntityTable {
  add(row: Record<string, unknown>): Promise<void>
  end(): Promise<{ sha256: string; size: number; count: number }>
}

export interface TableSet {
  begin(entity: ExportEntity): Promise<EntityTable>
  finish(): Promise<SheetRecord[]>
}

export const WORKBOOK_FILE = 'workbook.xlsx'

export function csvFileName(entityName: string): string {
  return `${entityName}.csv`
}

export function createTableSet(workDir: string, maxSheetRows?: number): TableSet {
  const workbook: WorkbookBuilder = createWorkbookBuilder(
    join(workDir, WORKBOOK_FILE),
    maxSheetRows,
  )
  return {
    async begin(entity) {
      const columns = entityColumns(entity)
      const out = createWriteStream(join(workDir, csvFileName(entity.name)))
      const hash = createHash('sha256')
      let size = 0
      let count = 0
      const write = async (text: string) => {
        const buf = Buffer.from(text, 'utf8')
        hash.update(buf)
        size += buf.length
        if (!out.write(buf)) await once(out, 'drain')
      }
      await write(CSV_BOM + csvLine(columns))
      workbook.startEntity(entity.name, columns)
      return {
        async add(row) {
          const values = new Map(Object.entries(row))
          const texts = columns.map((c) => cellText(values.get(c)))
          workbook.addRow(texts)
          await write(csvLine(texts.map(safeForSpreadsheet)))
          count += 1
        },
        async end() {
          workbook.finishEntity()
          out.end()
          await once(out, 'close')
          return { sha256: hash.digest('hex'), size, count }
        },
      }
    },
    finish: () => workbook.close(),
  }
}
