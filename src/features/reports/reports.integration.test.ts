import { randomUUID } from 'node:crypto'
import { and, eq, sql } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { applications, clocks, roleCapabilities } from '@/db/schema'
import { postEntry } from '@/features/ledger/postEntry'
import type { PostEntryInput } from '@/features/ledger/types'
import { permitVolumeCsv, processingTimeCsv, revenueCsv } from '@/features/reports/csv'
import { permitVolumeReport } from '@/features/reports/permitVolume'
import { processingTimeReport } from '@/features/reports/processingTime'
import { revenueReport } from '@/features/reports/revenue'
import { makeApplication, type PermitWorld, setupPermitWorld } from '@/test/applicationFixtures'
import { makeTestDb, type TestDb } from '@/test/db'
import { lineAllocation, submittedTrade } from '@/test/ledgerFixtures'
import { staffActor } from '@/test/parcels'
import type { CivilDate } from '@/types/civilDate'

const signal = new AbortController().signal
const RANGE = { from: '2027-01-01' as CivilDate, to: '2027-12-31' as CivilDate }
let handle: TestDb
let world: PermitWorld

beforeAll(async () => {
  handle = await makeTestDb()
  world = await setupPermitWorld(handle.db, {
    starters: ['nh.starter.electrical', 'nh.starter.building'],
  })
})
afterAll(async () => {
  await handle.drop()
})

const electrical = (patch: Parameters<typeof makeApplication>[2]) =>
  makeApplication(handle.db, world, patch, new Date('2027-03-02T15:00:00Z'), 'EL')

describe('permit volume', () => {
  it('three electrical permits received in March 2027 and two issued count 3 and 2', async () => {
    await electrical({ receivedDate: '2027-03-03', issuedOn: '2027-03-09' })
    await electrical({ receivedDate: '2027-03-10', issuedOn: '2027-03-20' })
    await electrical({ receivedDate: '2027-03-15' })
    const result = await permitVolumeReport(handle.db, world.staff, RANGE, signal)
    if (!result.ok) throw new Error(result.error)
    const march = result.value.find((r) => r.month === '2027-03' && r.type === 'EL')
    expect(march).toMatchObject({ received: 3, issued: 2 })
  })

  it('an application received 2027-03-31T23:30 Eastern counts in March', async () => {
    const trade = await submittedTrade(handle.db, world, new Date('2027-04-01T03:30:00Z'))
    const [row] = await handle.db
      .select({ received: applications.receivedDate })
      .from(applications)
      .where(eq(applications.id, trade.applicationId))
    expect(row?.received).toBe('2027-03-31')
    const result = await permitVolumeReport(
      handle.db,
      world.staff,
      { from: '2027-03-31' as CivilDate, to: '2027-03-31' as CivilDate },
      signal,
    )
    if (!result.ok) throw new Error(result.error)
    expect(result.value.find((r) => r.month === '2027-03' && r.type === 'EL')?.received).toBe(1)
  })

  it('counts a denied transition in the month it happened in the town time zone', async () => {
    const app = await electrical({ receivedDate: '2027-05-03' })
    await handle.db.execute(sql`insert into audit_log (actor_kind, action, entity_type, entity_id, after, at)
      values ('system', 'application.transition', 'application', ${app.applicationId}, '{"state":"denied"}'::jsonb, '2027-06-01T02:00:00Z')`)
    const result = await permitVolumeReport(handle.db, world.staff, RANGE, signal)
    if (!result.ok) throw new Error(result.error)
    expect(result.value.find((r) => r.month === '2027-05' && r.type === 'EL')?.denied).toBe(1)
    expect(result.value.find((r) => r.month === '2027-06' && r.type === 'EL')?.denied ?? 0).toBe(0)
  })

  it('range over 1827 days is refused', async () => {
    const result = await permitVolumeReport(
      handle.db,
      world.staff,
      { from: '2020-01-01' as CivilDate, to: '2027-12-31' as CivilDate },
      signal,
    )
    expect(result).toEqual({ ok: false, error: 'range_too_long' })
  })

  it('reviewer is forbidden', async () => {
    const result = await permitVolumeReport(handle.db, world.reviewer, RANGE, signal)
    expect(result).toEqual({ ok: false, error: 'forbidden' })
  })

  it('csv has the documented header and quotes a type label containing a comma', () => {
    const csv = permitVolumeCsv([
      {
        month: '2027-03',
        type: 'Fence, wall',
        received: 1,
        issued: 0,
        closed: 0,
        denied: 0,
        withdrawn: 0,
      },
    ])
    expect(csv.startsWith('Month,Type,Received,Issued,Closed,Denied,Withdrawn\r\n')).toBe(true)
    expect(csv).toContain('2027-03,"Fence, wall",1,0,0,0,0\r\n')
  })
})

describe('processing time', () => {
  it('median of 2, 4, and 9 days is 4.0 and p90 is 8.0', async () => {
    for (const days of [2, 4, 9]) {
      const received = new Date(Date.UTC(2027, 6, 1))
      const issued = new Date(received.getTime() + days * 86_400_000)
      await electrical({
        receivedDate: received.toISOString().slice(0, 10),
        issuedOn: issued.toISOString().slice(0, 10),
      })
    }
    const result = await processingTimeReport(
      handle.db,
      world.staff,
      { from: '2027-07-01' as CivilDate, to: '2027-07-31' as CivilDate },
      signal,
    )
    if (!result.ok) throw new Error(result.error)
    const row = result.value.find((r) => r.type === 'EL')
    expect(row).toMatchObject({ issued: 3, medianReceivedToIssued: 4, p90ReceivedToIssued: 8 })
    expect(processingTimeCsv(result.value)).toContain('EL,3,4.0,8.0,')
  })

  it('a building decision on its due date is on time; one day after is late', async () => {
    const onTime = await makeApplication(handle.db, world, {
      receivedDate: '2027-09-01',
      completedDate: '2027-09-02',
      decidedOn: '2027-10-02',
      issuedOn: '2027-10-03',
    })
    const late = await makeApplication(handle.db, world, {
      receivedDate: '2027-09-01',
      completedDate: '2027-09-02',
      decidedOn: '2027-10-03',
      issuedOn: '2027-10-04',
    })
    for (const [app, metOn] of [
      [onTime, '2027-10-02'],
      [late, '2027-10-03'],
    ] as const) {
      await handle.db.insert(clocks).values({
        applicationId: app.applicationId,
        ruleKey: 'nh.bp.decision',
        ruleVersion: 1,
        packVersion: 'test',
        startEvent: 'application_complete',
        startDate: '2027-09-02',
        lengthValue: 30,
        lengthUnit: 'days',
        countingMethod: 'calendar',
        computedDue: '2027-10-02',
        currentDue: '2027-10-02',
        status: 'met',
        metOn,
        source: 'pack_rule',
      })
    }
    const result = await processingTimeReport(
      handle.db,
      world.staff,
      { from: '2027-10-01' as CivilDate, to: '2027-10-31' as CivilDate },
      signal,
    )
    if (!result.ok) throw new Error(result.error)
    const row = result.value.find((r) => r.type === 'BP')
    expect(row).toMatchObject({ decidedOnTime: 1, decidedLate: 1 })
    const [check] = await handle.db
      .select({ n: applications.number })
      .from(applications)
      .where(and(eq(applications.id, onTime.applicationId)))
    expect(check?.n).toBeDefined()
  })
})

describe('revenue', () => {
  const post = async (input: PostEntryInput) => {
    const posted = await handle.db.transaction((tx) => postEntry(tx, input, signal))
    if (!posted.ok) throw new Error(posted.error)
    return posted.value.entryId
  }
  const base = (trade: Awaited<ReturnType<typeof submittedTrade>>) => ({
    method: 'card_online' as const,
    payerName: 'Pat Contractor',
    actor: { kind: 'user' as const, userId: world.staff.userId },
    processor: { name: 'stripe' as const, accountId: randomUUID(), objectId: `pi_${randomUUID()}` },
    trade,
  })

  it('nets a prorated 1000 refund against a 4635 card payment as 3529 permit fees plus 106 convenience fee on its own row', async () => {
    const trade = await submittedTrade(handle.db, world, new Date('2027-11-02T15:00:00Z'))
    const b = base(trade)
    const paid = await post({
      entryType: 'payment',
      method: b.method,
      amountCents: 4635,
      postedAt: new Date('2027-11-03T15:00:00Z'),
      payerName: b.payerName,
      actor: b.actor,
      processor: b.processor,
      allocations: [
        lineAllocation(trade, 4500),
        { targetKind: 'convenience_fee', applicationId: trade.applicationId, amountCents: 135 },
      ],
    })
    await post({
      entryType: 'refund',
      method: b.method,
      amountCents: -1000,
      postedAt: new Date('2027-11-04T15:00:00Z'),
      reversesEntryId: paid,
      reason: 'Reduced scope',
      payerName: b.payerName,
      actor: b.actor,
      processor: { ...b.processor, objectId: `re_${randomUUID()}` },
      allocations: [
        lineAllocation(trade, -971),
        { targetKind: 'convenience_fee', applicationId: trade.applicationId, amountCents: -29 },
      ],
    })
    const result = await revenueReport(
      handle.db,
      world.staff,
      { from: '2027-11-01' as CivilDate, to: '2027-11-30' as CivilDate },
      signal,
    )
    if (!result.ok) throw new Error(result.error)
    const fee = result.value.find((r) => r.kind === 'fee' && r.code === 'el')
    const convenience = result.value.find((r) => r.kind === 'convenience_fee')
    expect(fee?.netCents).toBe(3529)
    expect(convenience?.netCents).toBe(106)
    expect(revenueCsv(result.value)).toContain('2027-11,el,')
  })

  it('simulated payments are not town revenue', async () => {
    const trade = await submittedTrade(handle.db, world, new Date('2027-12-02T15:00:00Z'))
    const b = base(trade)
    await post({
      entryType: 'payment',
      method: b.method,
      amountCents: 4500,
      postedAt: new Date('2027-12-03T15:00:00Z'),
      payerName: b.payerName,
      actor: b.actor,
      processor: { name: 'simulated', accountId: randomUUID(), objectId: 'sim_1' },
      allocations: [lineAllocation(trade, 4500)],
    })
    const result = await revenueReport(
      handle.db,
      world.staff,
      { from: '2027-12-01' as CivilDate, to: '2027-12-31' as CivilDate },
      signal,
    )
    if (!result.ok) throw new Error(result.error)
    expect(result.value.find((r) => r.kind === 'fee')).toBeUndefined()
    expect(result.value.find((r) => r.kind === 'simulated')?.netCents).toBe(4500)
  })

  it('staff cannot see revenue without payment.report but can still see volume', async () => {
    const plain = await staffActor(handle.db, 'inspector')
    expect(await revenueReport(handle.db, plain, RANGE, signal)).toEqual({
      ok: false,
      error: 'forbidden',
    })
    await handle.db
      .delete(roleCapabilities)
      .where(
        and(eq(roleCapabilities.role, 'staff'), eq(roleCapabilities.capability, 'payment.report')),
      )
    expect(await revenueReport(handle.db, world.staff, RANGE, signal)).toEqual({
      ok: false,
      error: 'forbidden',
    })
    expect((await permitVolumeReport(handle.db, world.staff, RANGE, signal)).ok).toBe(true)
    await handle.db
      .insert(roleCapabilities)
      .values({ role: 'staff', capability: 'payment.report' })
      .onConflictDoNothing()
  })

  it('csv quotes a fee label containing a comma', () => {
    const csv = revenueCsv([
      { month: '2027-03', kind: 'fee', code: 'fence', label: 'Fence, wall', netCents: 1250 },
    ])
    expect(csv.startsWith('Month,Fee code,Fee,Net\r\n')).toBe(true)
    expect(csv).toContain('2027-03,fence,"Fence, wall",12.50\r\n')
  })
})
