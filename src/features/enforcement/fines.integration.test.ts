import { eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { auditLog, enforcementFines, ledgerAllocations, ledgerEntries } from '@/db/schema'
import { recordCounterPayment } from '@/features/counter/counterPayment'
import { recordEnforcementAppeal } from '@/features/enforcement/appeals'
import { fineBalance, recordFine } from '@/features/enforcement/fines'
import { ledgerEntryVisibleTo } from '@/features/ledger/visibility'
import { cashReceiptsReport } from '@/features/reports/cashReceipts'
import type { ObjectStore } from '@/features/storage/objectStore'
import { makeTestDb, type TestDb } from '@/test/db'
import {
  type EnforcementWorld,
  type IssuedOrder,
  issuedOrder,
  judgmentFor,
  setupEnforcementWorld,
} from '@/test/enforcementFixtures'
import { makeTestStore } from '@/test/minio'
import { staffActor } from '@/test/parcels'
import type { CivilDate } from '@/types/civilDate'

const signal = new AbortController().signal
const d = (s: string) => s as CivilDate
const NOW = new Date('2027-07-20T15:00:00Z')
let handle: TestDb
let store: ObjectStore
let world: EnforcementWorld
let order: IssuedOrder

beforeEach(async () => {
  handle = await makeTestDb()
  store = (await makeTestStore()).store
  world = await setupEnforcementWorld(handle.db)
  order = await issuedOrder(handle.db, store, world)
})
afterEach(async () => {
  await handle.drop()
})

async function fine(judgmentStepId: string, amountCents = 27500) {
  return await recordFine(
    handle.db,
    world.finance,
    {
      caseId: order.caseId,
      orderId: order.orderId,
      kind: 'civil_penalty',
      ruleKey: 'nh.enf.penalty_zoning',
      amountCents,
      imposedOn: d('2027-06-18'),
      court: 'District Court, Alder Pond Division',
      docket: '2027-CV-0042',
      judgmentStepId,
    },
    signal,
    NOW,
  )
}

async function pay(fineId: string, amountCents: number) {
  return await recordCounterPayment(
    handle.db,
    world.finance,
    {
      method: 'cash',
      amountCents,
      payerName: 'Pat Owner',
      allocations: [{ targetKind: 'fine', fineId, amountCents }],
    },
    signal,
    NOW,
  )
}

describe('fines on the ledger', () => {
  it('fine without a recorded judgment is refused', async () => {
    const result = await recordFine(
      handle.db,
      world.finance,
      {
        caseId: order.caseId,
        orderId: order.orderId,
        kind: 'civil_penalty',
        ruleKey: 'nh.enf.penalty_zoning',
        amountCents: 27500,
        imposedOn: d('2027-06-18'),
        court: 'District Court',
        docket: '2027-CV-0042',
      },
      signal,
      NOW,
    )
    expect(result).toEqual({ ok: false, error: 'judgment_required' })
    expect(await handle.db.select().from(enforcementFines)).toHaveLength(0)
  })

  it('a judgment that annulled the order does not support a fine', async () => {
    const annulled = await judgmentFor(handle.db, store, world, order, 'annulled')
    expect(await fine(annulled)).toEqual({ ok: false, error: 'judgment_required' })
  })

  it('a recorded judgment supports a fine of 27500 cents', async () => {
    const step = await judgmentFor(handle.db, store, world, order)
    const recorded = await fine(step)
    if (!recorded.ok) throw new Error(recorded.error)
    const balance = await fineBalance(handle.db, recorded.value.fineId, signal)
    expect(balance).toEqual({ imposedCents: 27500, paidCents: 0, dueCents: 27500 })
    const audit = await handle.db
      .select()
      .from(auditLog)
      .where(eq(auditLog.entityId, recorded.value.fineId))
    expect(audit.map((a) => a.action)).toContain('enforcement.fine_recorded')
  })

  it('cash payment of 20000 against a 27500 fine leaves 7500 due', async () => {
    const recorded = await fine(await judgmentFor(handle.db, store, world, order))
    if (!recorded.ok) throw new Error(recorded.error)
    const paid = await pay(recorded.value.fineId, 20000)
    expect(paid.ok).toBe(true)
    expect(await fineBalance(handle.db, recorded.value.fineId, signal)).toEqual({
      imposedCents: 27500,
      paidCents: 20000,
      dueCents: 7500,
    })
  })

  it('payment over the fine balance is over_allocated', async () => {
    const recorded = await fine(await judgmentFor(handle.db, store, world, order))
    if (!recorded.ok) throw new Error(recorded.error)
    await pay(recorded.value.fineId, 20000)
    expect(await pay(recorded.value.fineId, 7501)).toEqual({ ok: false, error: 'over_allocated' })
    expect((await pay(recorded.value.fineId, 7500)).ok).toBe(true)
    expect((await fineBalance(handle.db, recorded.value.fineId, signal)).dueCents).toBe(0)
  })

  it('fine during a stay is stayed', async () => {
    const step = await judgmentFor(handle.db, store, world, order)
    await recordEnforcementAppeal(
      handle.db,
      world.staff,
      {
        caseId: order.caseId,
        targetKind: 'order',
        targetId: order.orderId,
        filedOn: d('2027-07-01'),
        appellantName: 'Pat Owner',
      },
      signal,
    )
    expect(await fine(step)).toEqual({ ok: false, error: 'stayed' })
  })

  it('staff without fine.record is forbidden', async () => {
    const step = await judgmentFor(handle.db, store, world, order)
    const result = await recordFine(
      handle.db,
      world.staff,
      {
        caseId: order.caseId,
        orderId: order.orderId,
        kind: 'civil_penalty',
        amountCents: 27500,
        imposedOn: d('2027-06-18'),
        court: 'District Court',
        docket: '2027-CV-0042',
        judgmentStepId: step,
      },
      signal,
      NOW,
    )
    expect(result).toEqual({ ok: false, error: 'forbidden' })
  })

  it('a fine step from another case is judgment_required', async () => {
    const step = await judgmentFor(handle.db, store, world, order)
    const other = await issuedOrder(handle.db, store, world, { location: '2 Elm Street' })
    const result = await recordFine(
      handle.db,
      world.finance,
      {
        caseId: other.caseId,
        orderId: other.orderId,
        kind: 'civil_penalty',
        amountCents: 27500,
        imposedOn: d('2027-06-18'),
        court: 'District Court',
        docket: '2027-CV-0042',
        judgmentStepId: step,
      },
      signal,
      NOW,
    )
    expect(result).toEqual({ ok: false, error: 'judgment_required' })
  })

  it('the payment shows on the cash receipts report as court-imposed fines', async () => {
    const recorded = await fine(await judgmentFor(handle.db, store, world, order))
    if (!recorded.ok) throw new Error(recorded.error)
    await pay(recorded.value.fineId, 20000)
    const report = await cashReceiptsReport(
      handle.db,
      world.finance,
      { date: d('2027-07-20') },
      signal,
    )
    if (!report.ok) throw new Error(report.error)
    expect(report.value.rows).toContainEqual(
      expect.objectContaining({ label: 'Court-imposed fine', totalCents: 20000 }),
    )
  })

  it('a property owner who is a signed-in resident cannot see the fine payment', async () => {
    const recorded = await fine(await judgmentFor(handle.db, store, world, order))
    if (!recorded.ok) throw new Error(recorded.error)
    await pay(recorded.value.fineId, 20000)
    const resident = await staffActor(handle.db, 'applicant')
    const visible = await handle.db
      .select({ id: ledgerEntries.id })
      .from(ledgerEntries)
      .where(ledgerEntryVisibleTo(resident))
    expect(visible).toHaveLength(0)
    const allocations = await handle.db.select().from(ledgerAllocations)
    expect(allocations[0]).toMatchObject({ targetKind: 'fine', applicationId: null })
  })
})
