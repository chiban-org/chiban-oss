import ExcelJS from 'exceljs'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import type { Actor } from '@/features/auth/actor'
import { makeApplication, type PermitWorld, setupPermitWorld } from '@/test/applicationFixtures'
import { makeTestDb, type TestDb } from '@/test/db'

const state = vi.hoisted((): { db: unknown; actor: Actor | null } => ({ db: null, actor: null }))
vi.mock('@/db/client', () => ({
  get db() {
    return state.db
  },
}))
vi.mock('@/server/requireStaff', () => ({
  staffActorOrNull: () => Promise.resolve(state.actor),
}))

const { GET } = await import('./route')
const XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

let handle: TestDb
let world: PermitWorld

beforeAll(async () => {
  handle = await makeTestDb()
  state.db = handle.db
  world = await setupPermitWorld(handle.db, {
    buildingType: { reportFields: ['finished_sq_ft'] },
  })
  await makeApplication(handle.db, world, {
    receivedDate: '2027-03-03',
    values: { finished_sq_ft: '850' },
  })
})
afterAll(async () => {
  await handle.drop()
})

const call = (report: string, query: string) =>
  GET(new Request(`https://alderpond.example/staff/reports/${report}/xlsx?${query}`), {
    params: Promise.resolve({ report }),
  })

describe('report xlsx route', () => {
  it('downloads permit volume as a workbook with the reporting field as a column', async () => {
    state.actor = world.staff
    const res = await call('permit-volume', 'from=2027-03-01&to=2027-03-31')
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe(XLSX)
    expect(res.headers.get('content-disposition')).toBe(
      'attachment; filename="permit-volume-2027-03-01-to-2027-03-31.xlsx"',
    )
    const book = new ExcelJS.Workbook()
    await book.xlsx.load(await res.arrayBuffer())
    const sheet = book.worksheets[0]
    expect(sheet?.getRow(1).getCell(8).value).toBe('Finished sq ft')
    expect(sheet?.getRow(2).getCell(8).value).toBe(850)
  })

  it('refuses a reviewer', async () => {
    state.actor = world.reviewer
    const res = await call('revenue', 'from=2027-03-01&to=2027-03-31')
    expect(res.status).toBe(403)
  })
})
