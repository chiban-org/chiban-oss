import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { enforcementCases, enforcementOrders, orderServiceRecipients } from '@/db/schema'
import type { Actor } from '@/features/auth/actor'
import { listCaseQueue } from '@/features/enforcement/caseQueue'
import { openCase } from '@/features/enforcement/cases'
import { makeTestDb, type TestDb } from '@/test/db'
import { seedParcelWorld, staffActor } from '@/test/parcels'
import type { CivilDate } from '@/types/civilDate'

const signal = new AbortController().signal
const NOW = new Date('2027-03-02T15:00:00Z')
const TODAY = '2027-03-02' as CivilDate
let handle: TestDb
let staff: Actor

async function liveCase(
  location: string,
  number: string,
  answerDue: string,
  correctiveDeadline: string,
): Promise<string> {
  const opened = await openCase(handle.db, staff, { locationText: location }, signal, NOW)
  if (!opened.ok) throw new Error('open failed')
  const caseId = opened.value.caseId
  await handle.db
    .update(enforcementCases)
    .set({ status: 'order_issued' })
    .where(eq(enforcementCases.id, caseId))
  const [order] = await handle.db
    .insert(enforcementOrders)
    .values({
      caseId,
      number,
      ruleKey: 'nh.enf.cd_zoning',
      ruleVersion: 1,
      correctiveAction: 'Remove it',
      correctiveDeadline,
      status: 'served',
      draftedBy: staff.userId,
    })
    .returning({ id: enforcementOrders.id })
  await handle.db.insert(orderServiceRecipients).values({
    orderId: order?.id ?? '',
    role: 'record_owner',
    name: 'Pat Owner',
    address: '1 Main St',
    source: 'CAMA owner',
    answerDue: { due: answerDue },
  })
  return caseId
}

beforeAll(async () => {
  handle = await makeTestDb()
  await seedParcelWorld(handle.db)
  staff = await staffActor(handle.db, 'staff')
})
afterAll(async () => {
  await handle.drop()
})

async function dueOf(caseId: string) {
  const queue = await listCaseQueue(
    handle.db,
    staff,
    { filters: {}, limit: 25, offset: 0 },
    TODAY,
    signal,
  )
  return queue.rows.find((r) => r.caseId === caseId)?.due
}

describe('due date on the enforcement list', () => {
  it('is the running answer date while one runs, then the corrective action deadline', async () => {
    const answerFirst = await liveCase('1 Oak Lane', 'EO-A', '2027-03-10', '2027-04-10')
    const laterAnswer = await liveCase('2 Pine Lane', 'EO-B', '2027-03-20', '2027-03-12')
    expect(await dueOf(answerFirst)).toMatchObject({ date: '2027-03-10', label: 'Answer due' })
    expect(await dueOf(laterAnswer)).toMatchObject({
      date: '2027-03-20',
      label: 'Answer due',
    })
  })

  it('moves to the corrective action deadline once the answer period has lapsed', async () => {
    const lapsed = await liveCase('4 Ash Lane', 'EO-D', '2027-02-20', '2027-03-12')
    expect(await dueOf(lapsed)).toMatchObject({
      date: '2027-03-12',
      label: 'Corrective action due',
      daysLeft: 10,
    })
  })

  it('keeps a running answer date on a case in court, as the case page does', async () => {
    const inCourt = await liveCase('5 Elm Lane', 'EO-E', '2027-03-18', '2027-04-20')
    await handle.db
      .update(enforcementCases)
      .set({ status: 'in_court' })
      .where(eq(enforcementCases.id, inCourt))
    expect(await dueOf(inCourt)).toMatchObject({ date: '2027-03-18', label: 'Answer due' })
  })

  it('keeps a passed corrective action deadline as overdue when nothing else is running', async () => {
    const passed = await liveCase('3 Fir Lane', 'EO-C', '2027-02-18', '2027-02-20')
    expect(await dueOf(passed)).toMatchObject({
      date: '2027-02-20',
      label: 'Corrective action due',
      daysLeft: -10,
    })
    const overdue = await listCaseQueue(
      handle.db,
      staff,
      { filters: { due: ['overdue'] }, limit: 25, offset: 0 },
      TODAY,
      signal,
    )
    expect(overdue.rows.map((r) => r.caseId)).toContain(passed)
  })
})
