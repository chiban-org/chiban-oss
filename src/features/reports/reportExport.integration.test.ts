import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { postEntry } from '@/features/ledger/postEntry'
import { buildReportExport } from '@/features/reports/reportExport'
import { sheetCsv } from '@/features/reports/sheet'
import { makeApplication } from '@/test/applicationFixtures'
import { makeTestDb, type TestDb } from '@/test/db'
import {
  lineAllocation,
  setupTradeWorld,
  submittedTrade,
  type TradeFixture,
} from '@/test/ledgerFixtures'
import type { CivilDate } from '@/types/civilDate'

const signal = new AbortController().signal
const range = (from: string, to: string) => ({ from: from as CivilDate, to: to as CivilDate })
let handle: TestDb
let trade: TradeFixture

async function cashOn(postedAt: Date, amountCents: number) {
  const posted = await handle.db.transaction((tx) =>
    postEntry(
      tx,
      {
        entryType: 'payment',
        method: 'cash',
        postedAt,
        payerName: 'Pat Contractor',
        actor: { kind: 'user', userId: trade.world.staff.userId },
        amountCents,
        allocations: [lineAllocation(trade, amountCents)],
      },
      signal,
    ),
  )
  if (!posted.ok) throw new Error(posted.error)
}

beforeAll(async () => {
  handle = await makeTestDb()
  const { world } = await setupTradeWorld(handle.db)
  trade = await submittedTrade(handle.db, world)
  await cashOn(new Date('2027-03-02T15:00:00Z'), 2000)
  await cashOn(new Date('2027-03-04T15:00:00Z'), 2500)
  await makeApplication(handle.db, world, { state: 'issued', issuedOn: '2027-03-10' })
})
afterAll(async () => {
  await handle.drop()
})

describe('buildReportExport', () => {
  it('names the permit volume file after its dates', async () => {
    const built = await buildReportExport(
      handle.db,
      trade.world.staff,
      { report: 'permit-volume', range: range('2027-03-01', '2027-03-31') },
      signal,
    )
    if (!built.ok) throw new Error(JSON.stringify(built.error))
    expect(built.value.basename).toBe('permit-volume-2027-03-01-to-2027-03-31')
    expect(built.value.title).toBe('Permit volume')
    expect(built.value.rows[0]?.[0]).toBe('Month')
  })

  it('cash receipts for a week list only the days with receipts and a period total', async () => {
    const built = await buildReportExport(
      handle.db,
      trade.world.staff,
      { report: 'cash-receipts', range: range('2027-03-01', '2027-03-07') },
      signal,
    )
    if (!built.ok) throw new Error(JSON.stringify(built.error))
    expect(built.value.basename).toBe('cash-receipts-2027-03-01-to-2027-03-07')
    const lines = sheetCsv(built.value.rows).split('\r\n')
    expect(lines[0]).toBe('Date,Fee code,Fee,Cash,Check,Card present,Card online,Simulated,Total')
    expect(lines.filter((l) => l.includes(',Total,')).map((l) => l.split(',')[0])).toEqual([
      '2027-03-02',
      '2027-03-04',
      '2027-03-01 to 2027-03-07',
    ])
    expect(lines.at(-2)).toBe('2027-03-01 to 2027-03-07,,Total,45.00,0.00,0.00,0.00,0.00,45.00')
  })

  it('a single cash receipts day is the same file the daily report always exported', async () => {
    const built = await buildReportExport(
      handle.db,
      trade.world.staff,
      { report: 'cash-receipts', range: range('2027-03-06', '2027-03-06') },
      signal,
    )
    if (!built.ok) throw new Error(JSON.stringify(built.error))
    expect(built.value.basename).toBe('cash-receipts-2027-03-06')
    expect(sheetCsv(built.value.rows).split('\r\n')).toHaveLength(5)
  })

  it('refuses cash receipts over more than a year', async () => {
    const built = await buildReportExport(
      handle.db,
      trade.world.staff,
      { report: 'cash-receipts', range: range('2026-01-01', '2027-03-07') },
      signal,
    )
    expect(built).toEqual({ ok: false, error: 'range' })
  })

  it('census covers whole months or years only and refuses an incomplete month', async () => {
    const week = await buildReportExport(
      handle.db,
      trade.world.staff,
      { report: 'census', range: range('2027-03-01', '2027-03-07') },
      signal,
    )
    expect(week).toEqual({ ok: false, error: 'range' })
    const march = await buildReportExport(
      handle.db,
      trade.world.staff,
      { report: 'census', range: range('2027-03-01', '2027-03-31') },
      signal,
    )
    expect(march).toEqual({
      ok: false,
      error: {
        incomplete: 'This report is not complete. 1 issued building permit needs classification',
      },
    })
    const april = await buildReportExport(
      handle.db,
      trade.world.staff,
      { report: 'census', range: range('2027-04-01', '2027-04-30') },
      signal,
    )
    if (!april.ok) throw new Error(JSON.stringify(april.error))
    expect(april.value.basename).toBe('census-building-permits-2027-04')
  })

  it('a reviewer cannot export revenue or cash receipts', async () => {
    for (const report of ['revenue', 'cash-receipts', 'permit-volume'] as const) {
      const built = await buildReportExport(
        handle.db,
        trade.world.reviewer,
        { report, range: range('2027-03-01', '2027-03-07') },
        signal,
      )
      expect([report, built]).toEqual([report, { ok: false, error: 'forbidden' }])
    }
  })
})
