import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { enforcementCases } from '@/db/schema'
import { summarizeApplications } from '@/features/applications/recordSource'
import { summarizeCases } from '@/features/enforcement/recordSource'
import { summarizeInspections } from '@/features/inspections/recordSource'
import { makeApplication, type PermitWorld } from '@/test/applicationFixtures'
import { makeTestDb, type TestDb } from '@/test/db'
import { insertInspection, setupInspectionWorld } from '@/test/inspectionFixtures'

const signal = new AbortController().signal
let handle: TestDb
let world: PermitWorld

beforeAll(async () => {
  handle = await makeTestDb()
  world = (await setupInspectionWorld(handle.db)).world
})
afterAll(async () => {
  await handle.drop()
})

const staff = () => ({ kind: 'actor' as const, actor: world.staff })
let caseCounter = 0

async function caseIn(status: (typeof enforcementCases.$inferInsert)['status']) {
  caseCounter += 1
  const [row] = await handle.db
    .insert(enforcementCases)
    .values({
      number: `EC-2027-08${String(caseCounter).padStart(2, '0')}`,
      locationText: '1 Main St',
      status,
      openedOn: '2027-02-02',
    })
    .returning({ id: enforcementCases.id })
  const [s] = await summarizeCases(handle.db, [row?.id ?? ''], staff(), signal)
  return s
}

describe('how parcel records stand', () => {
  it('counts an issued permit as in force and not closed', async () => {
    const app = await makeApplication(handle.db, world, { state: 'issued', issuedOn: '2027-01-10' })
    const [s] = await summarizeApplications(handle.db, [app.applicationId], staff(), signal)
    expect(s).toMatchObject({ closed: false, openAs: 'permit_in_force' })
  })

  it('counts a closed permit as closed', async () => {
    const app = await makeApplication(handle.db, world, { state: 'closed' })
    const [s] = await summarizeApplications(handle.db, [app.applicationId], staff(), signal)
    expect(s).toMatchObject({ closed: true, openAs: null })
  })

  it('marks a case with an order as failed and open, and a resolved case as closed', async () => {
    expect(await caseIn('order_issued')).toMatchObject({
      status: { label: 'Order issued', chip: 'failed' },
      closed: false,
      openAs: 'case',
    })
    expect(await caseIn('resolved')).toMatchObject({
      status: { label: 'Resolved', chip: 'neutral' },
      closed: true,
      openAs: null,
    })
  })

  it('keeps a scheduled inspection open with its date and closes a cancelled one', async () => {
    const app = await makeApplication(handle.db, world, { state: 'issued' }, undefined, 'EL')
    const first = await insertInspection(handle.db, app.applicationId, 'rough', {
      status: 'cancelled',
      cancelReason: 'staff',
    })
    const again = await insertInspection(handle.db, app.applicationId, 'rough', {
      status: 'scheduled',
      scheduledDate: '2027-05-06',
      reinspectionOf: first,
    })
    const rows = await summarizeInspections(handle.db, [first, again], staff(), signal)
    expect(rows.find((r) => r.recordId === first)).toMatchObject({
      title: 'Rough inspection',
      closed: true,
      openAs: null,
    })
    expect(rows.find((r) => r.recordId === again)).toMatchObject({
      title: 'Rough reinspection',
      closed: false,
      openAs: 'inspection_scheduled',
      scheduled: '2027-05-06',
    })
  })
})
