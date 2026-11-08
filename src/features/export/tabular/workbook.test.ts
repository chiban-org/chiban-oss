import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import ExcelJS from 'exceljs'
import { beforeAll, describe, expect, it } from 'vitest'
import { createWorkbookBuilder, sheetName } from '@/features/export/tabular/workbook'

let dir: string
beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), 'chiban-wb-'))
})

describe('sheetName', () => {
  it('keeps names within 31 characters and unique ignoring case', () => {
    const taken = new Set<string>()
    const long = 'enforcement_order_service_recipients'
    const first = sheetName(long, 1, taken)
    const second = sheetName(`${long}_other`, 1, taken)
    expect(first).toHaveLength(31)
    expect(second.length).toBeLessThanOrEqual(31)
    expect(second.toLowerCase()).not.toBe(first.toLowerCase())
  })

  it('suffixes continuation sheets within the limit', () => {
    const taken = new Set<string>()
    const name = sheetName('x'.repeat(40), 12, taken)
    expect(name).toHaveLength(31)
    expect(name.endsWith('_12')).toBe(true)
  })

  it('replaces characters Excel forbids', () => {
    expect(sheetName('a/b:c', 1, new Set())).toBe('a_b_c')
  })
})

describe('workbook builder', () => {
  it('writes a sheet per entity with a header row and splits rows past the limit', async () => {
    const file = join(dir, 'a.xlsx')
    const builder = createWorkbookBuilder(file, 4)
    builder.startEntity('parcels', ['id', 'note'])
    for (let n = 1; n <= 7; n += 1) builder.addRow([String(n), `=row ${n}`])
    builder.finishEntity()
    builder.startEntity('empty_things', ['id'])
    builder.finishEntity()
    const records = await builder.close()
    expect(records).toEqual([
      { entity: 'parcels', name: 'parcels', rows: 3 },
      { entity: 'parcels', name: 'parcels_2', rows: 3 },
      { entity: 'parcels', name: 'parcels_3', rows: 1 },
      { entity: 'empty_things', name: 'empty_things', rows: 0 },
    ])
    const book = new ExcelJS.Workbook()
    await book.xlsx.readFile(file)
    expect(book.worksheets.map((w) => w.name)).toEqual([
      'parcels',
      'parcels_2',
      'parcels_3',
      'empty_things',
    ])
    const second = book.getWorksheet('parcels_2')
    expect(second?.getRow(1).values).toEqual([undefined, 'id', 'note'])
    expect(second?.getRow(2).getCell(2).value).toBe('=row 4')
    expect(second?.rowCount).toBeLessThanOrEqual(4)
  })
})
