import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { and, eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { historicalRecords, parcelRecordLinks, roleCapabilities } from '@/db/schema'
import type { Actor } from '@/features/auth/actor'
import { getPublicParcelView } from '@/features/parcels/publicParcelView'
import { getStaffParcelView } from '@/features/parcels/staffParcelView'
import { makeTestDb, type TestDb } from '@/test/db'
import fixtureMapping from '@/test/fixtures/spreadsheet/alder-pond-permits.mapping.json'
import { makeParcel, seedParcelWorld, staffActor } from '@/test/parcels'
import { importSheet } from './importSheet'
import { type SpreadsheetMapping, spreadsheetMappingSchema } from './mapping'

const signal = new AbortController().signal
const XLSX = path.resolve('src/test/fixtures/spreadsheet/alder-pond-permits.xlsx')
const mapping: SpreadsheetMapping = spreadsheetMappingSchema.parse(fixtureMapping)
const UNPARSEABLE_DATE_SHEET_ROW = 18

let handle: TestDb
let importer: Actor
const parcelIds = new Map<number, string>()

beforeAll(async () => {
  handle = await makeTestDb()
  await seedParcelWorld(handle.db)
  await handle.db
    .insert(roleCapabilities)
    .values({ role: 'board_member', capability: 'parcel.manage' })
  importer = await staffActor(handle.db, 'board_member')
  for (let lot = 1; lot <= 7; lot += 1) {
    const value = `007${String(lot).padStart(3, '0')}000000`
    parcelIds.set(lot, await makeParcel(handle.db, [{ format: 'gis12', value }]))
  }
})

afterAll(async () => {
  await handle.drop()
})

async function run(dryRun = false, file = XLSX) {
  return await importSheet(handle.db, importer, { path: file, mapping, dryRun }, signal)
}

async function recordCount(): Promise<number> {
  return (await handle.db.select().from(historicalRecords)).length
}

describe('importSheet', () => {
  it('a dry run writes nothing but reports the same counts', async () => {
    const r = await run(true)
    if (!r.ok) throw new Error(JSON.stringify(r.error))
    expect(r.value).toMatchObject({ rows: 20, imported: 19, unresolvedParcel: 1 })
    expect(await recordCount()).toBe(0)
    expect(await handle.db.select().from(parcelRecordLinks)).toHaveLength(0)
  })

  it('a 20-row fixture imports 19 and reports one unparseable date', async () => {
    const r = await run()
    if (!r.ok) throw new Error(JSON.stringify(r.error))
    expect(r.value).toMatchObject({ rows: 20, imported: 19, alreadyImported: 0 })
    expect(r.value.errors).toHaveLength(1)
    expect(r.value.errors[0]?.row).toBe(UNPARSEABLE_DATE_SHEET_ROW)
    expect(r.value.errors[0]?.detail).toContain('date')
    expect(await recordCount()).toBe(19)
  })

  it('stores the dates from every format as civil dates', async () => {
    const rows = await handle.db.select().from(historicalRecords)
    const byNumber = new Map(rows.map((x) => [x.number, x.recordedOn]))
    expect(byNumber.get('B-1987-004')).toBe('1987-03-04')
    expect(byNumber.get('B-1995-019')).toBe('1995-06-12')
    expect(byNumber.get('P-1998-002')).toBe('1998-09-14')
    expect(byNumber.get('B-2001-007')).toBe('2001-04-30')
    expect(byNumber.get('S-2003-001')).toBe('2003-11-03')
    expect(byNumber.get('E-1991-011')).toBe('1991-01-01')
  })

  it('rerun imports nothing new', async () => {
    const r = await run()
    if (!r.ok) throw new Error(JSON.stringify(r.error))
    expect(r.value).toMatchObject({
      rows: 20,
      imported: 0,
      alreadyImported: 19,
      unresolvedParcel: 0,
    })
    expect(r.value.errors).toHaveLength(1)
    expect(await recordCount()).toBe(19)
    expect(await handle.db.select().from(parcelRecordLinks)).toHaveLength(19)
  })

  it('an unknown parcel goes to the unresolved queue', async () => {
    const [link] = await handle.db
      .select()
      .from(parcelRecordLinks)
      .where(
        and(
          eq(parcelRecordLinks.recordKind, 'historical_record'),
          eq(parcelRecordLinks.status, 'unresolved'),
        ),
      )
    expect(link).toMatchObject({ rawRefFormat: 'gis12', rawRefValue: '099001000000' })
  })

  it('public parcel history shows the historical record without its kept values', async () => {
    const view = await getPublicParcelView(handle.db, parcelIds.get(3) ?? '', new Date(), signal)
    if (!view.ok) throw new Error('view')
    const record = view.value.history.own.find((x) => x.number === 'B-2001-007')
    expect(record).toMatchObject({
      kind: 'historical_record',
      title: 'Building',
      date: '2001-04-30',
    })
    expect(record?.note).toBe('Deck, 12 by 16 feet')
    const serialized = JSON.stringify(view.value.history)
    expect(serialized).not.toContain('Plans on file')
    expect(serialized).not.toContain('Contractor')
  })

  it('staff parcel history shows the kept values', async () => {
    const staff = await staffActor(handle.db, 'staff')
    const view = await getStaffParcelView(
      handle.db,
      staff,
      parcelIds.get(3) ?? '',
      new Date(),
      signal,
    )
    if (!view.ok) throw new Error('view')
    const record = view.value.history.own.find((x) => x.number === 'B-2001-007')
    expect(record?.note).toContain('Deck, 12 by 16 feet')
    expect(record?.note).toContain('Contractor: Owner')
    expect(record?.note).toContain('Clerk Note: Plans on file')
  })

  it('a csv file imports through the same mapping', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'sheet-'))
    const file = path.join(dir, 'permits.csv')
    await writeFile(
      file,
      [
        'Ledger',
        'Map,Lot,Sub,Unit,Type,Permit No,Issued,Work,Contractor,Fee,Clerk Note',
        '7,4,0,0,Roofing,R-2007-001,5/6/07,Reroof,Fernhollow Roofing,50,',
      ].join('\n'),
    )
    const r = await importSheet(
      handle.db,
      importer,
      { path: file, mapping: { ...mapping, sheet: undefined }, dryRun: false },
      signal,
    )
    if (!r.ok) throw new Error(JSON.stringify(r.error))
    expect(r.value).toMatchObject({ rows: 1, imported: 1, errors: [] })
    const [row] = await handle.db
      .select()
      .from(historicalRecords)
      .where(eq(historicalRecords.number, 'R-2007-001'))
    expect(row).toMatchObject({ recordedOn: '2007-05-06', sourceSheet: 'csv', sourceRow: 3 })
  })

  it('an invalid mapping is refused before any row is read', async () => {
    const r = await importSheet(
      handle.db,
      importer,
      { path: XLSX, mapping: { ...mapping, headerRow: 0 }, dryRun: false },
      signal,
    )
    expect(r).toEqual({ ok: false, error: 'invalid_mapping' })
  })

  it('a missing column is reported without importing', async () => {
    const r = await importSheet(
      handle.db,
      importer,
      { path: XLSX, mapping: { ...mapping, keep: ['No Such Column'] }, dryRun: false },
      signal,
    )
    expect(r).toMatchObject({ ok: false, error: { kind: 'missing_columns' } })
  })

  it('an applicant and a reviewer are refused and nothing is written', async () => {
    const before = await recordCount()
    for (const role of ['applicant', 'reviewer'] as const) {
      const actor = await staffActor(handle.db, role)
      const r = await importSheet(handle.db, actor, { path: XLSX, mapping, dryRun: false }, signal)
      expect(r).toEqual({ ok: false, error: 'forbidden' })
    }
    expect(await recordCount()).toBe(before)
  })

  it('a board member without parcel.manage is refused', async () => {
    await handle.db
      .delete(roleCapabilities)
      .where(
        and(
          eq(roleCapabilities.role, 'board_member'),
          eq(roleCapabilities.capability, 'parcel.manage'),
        ),
      )
    const r = await run()
    expect(r).toEqual({ ok: false, error: 'forbidden' })
  })
})
