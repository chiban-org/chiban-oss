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

async function nextDueOf(caseId: string) {
  const queue = await listCaseQueue(
    handle.db,
    staff,
    { filters: {}, limit: 25, offset: 0 },
    TODAY,
    signal,
  )
  return queue.rows.find((r) => r.caseId === caseId)?.nextDue
}

describe('next date on the enforcement list', () => {
  it('is the earlier of the live answer date and the corrective action deadline', async () => {
    const answerFirst = await liveCase('1 Oak Lane', 'EO-A', '2027-03-10', '2027-04-10')
    const correctiveFirst = await liveCase('2 Pine Lane', 'EO-B', '2027-03-20', '2027-03-12')
    expect(await nextDueOf(answerFirst)).toEqual({ date: '2027-03-10', label: 'Answer due' })
    expect(await nextDueOf(correctiveFirst)).toEqual({
      date: '2027-03-12',
      label: 'Corrective action due',
    })
  })

  it('leaves out a corrective action deadline that has already passed', async () => {
    const passed = await liveCase('3 Fir Lane', 'EO-C', '2027-03-15', '2027-02-20')
    expect(await nextDueOf(passed)).toEqual({ date: '2027-03-15', label: 'Answer due' })
  })
})
