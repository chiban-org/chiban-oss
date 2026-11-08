import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { applications, inspectionItemResults, inspections, notificationOutbox } from '@/db/schema'
import { recordAppeal } from '@/features/appeals/appeals'
import { listInspectionHistory } from '@/features/inspections/history'
import { recordInspectionResult } from '@/features/inspections/recordResult'
import { requestInspection } from '@/features/inspections/requestInspection'
import { makeTestDb, type TestDb } from '@/test/db'
import {
  checklistIdFor,
  civil,
  type InspectionWorld,
  newIssuedPermit,
  passingItems,
  RESULT_NOW,
  scheduledInspection,
  setupInspectionWorld,
} from '@/test/inspectionFixtures'

const signal = new AbortController().signal
const deps = { now: RESULT_NOW }
let handle: TestDb
let w: InspectionWorld

beforeAll(async () => {
  handle = await makeTestDb()
  w = await setupInspectionWorld(handle.db)
})
afterAll(async () => {
  await handle.drop()
})

async function row(id: string) {
  const [r] = await handle.db.select().from(inspections).where(eq(inspections.id, id))
  if (r === undefined) throw new Error('missing')
  return r
}

async function appRow(id: string) {
  const [r] = await handle.db.select().from(applications).where(eq(applications.id, id))
  if (r === undefined) throw new Error('missing')
  return r
}

async function record(
  id: string,
  input: Partial<Parameters<typeof recordInspectionResult>[2]> & {
    result: 'passed' | 'failed'
    items: { itemKey: string; outcome: 'pass' | 'fail' | 'na'; note?: string }[]
  },
  actor: Parameters<typeof recordInspectionResult>[1] = w.inspector,
) {
  return await recordInspectionResult(
    handle.db,
    actor,
    { inspectionId: id, expectedRowVersion: (await row(id)).rowVersion, ...input },
    signal,
    deps,
  )
}

describe('recording results', () => {
  it('passing the final electrical inspection closes the permit with closure_reason final_inspection_passed', async () => {
    const permit = await newIssuedPermit(handle.db, w, 'EL')
    const id = await scheduledInspection(handle.db, w.inspector, permit.applicationId, 'final')
    const items = await passingItems(handle.db, permit.applicationId, 'final')
    const r = await record(id, { result: 'passed', items })
    expect(r).toEqual({ ok: true, value: { applicationState: 'closed', closed: true } })
    expect(await appRow(permit.applicationId)).toMatchObject({
      state: 'closed',
      closureReason: 'final_inspection_passed',
    })
    expect((await row(id)).status).toBe('passed')
  })

  it('passing the rough inspection leaves the permit issued', async () => {
    const permit = await newIssuedPermit(handle.db, w, 'EL')
    const id = await scheduledInspection(handle.db, w.inspector, permit.applicationId, 'rough')
    const items = await passingItems(handle.db, permit.applicationId, 'rough')
    const r = await record(id, { result: 'passed', items })
    expect(r).toEqual({ ok: true, value: { applicationState: 'issued', closed: false } })
    expect((await appRow(permit.applicationId)).state).toBe('issued')
  })

  it('passing the building final moves the substep to co_pending and leaves the permit issued', async () => {
    const permit = await newIssuedPermit(handle.db, w, 'BP')
    const id = await scheduledInspection(handle.db, w.inspector, permit.applicationId, 'final')
    const items = await passingItems(handle.db, permit.applicationId, 'final')
    const r = await record(id, { result: 'passed', items })
    expect(r).toEqual({ ok: true, value: { applicationState: 'issued', closed: false } })
    expect(await appRow(permit.applicationId)).toMatchObject({
      state: 'issued',
      substep: 'co_pending',
    })
  })

  it('pass with a failed or missing required item is result_conflicts_items', async () => {
    const permit = await newIssuedPermit(handle.db, w, 'BP')
    const id = await scheduledInspection(handle.db, w.inspector, permit.applicationId, 'footing')
    const items = await passingItems(handle.db, permit.applicationId, 'footing')
    const withFail = items.map((i, n) => (n === 0 ? { ...i, outcome: 'fail' as const } : i))
    expect(await record(id, { result: 'passed', items: withFail })).toEqual({
      ok: false,
      error: 'result_conflicts_items',
    })
    expect(await record(id, { result: 'passed', items: items.slice(1) })).toEqual({
      ok: false,
      error: 'result_conflicts_items',
    })
    expect((await row(id)).status).toBe('scheduled')
  })

  it('required item marked na fails a pass', async () => {
    const permit = await newIssuedPermit(handle.db, w, 'BP')
    const id = await scheduledInspection(handle.db, w.inspector, permit.applicationId, 'footing')
    const items = (await passingItems(handle.db, permit.applicationId, 'footing')).map((i, n) =>
      n === 0 ? { ...i, outcome: 'na' as const } : i,
    )
    expect(await record(id, { result: 'passed', items })).toEqual({
      ok: false,
      error: 'result_conflicts_items',
    })
  })

  it('fail without a failed item is result_conflicts_items', async () => {
    const permit = await newIssuedPermit(handle.db, w, 'EL')
    const id = await scheduledInspection(handle.db, w.inspector, permit.applicationId, 'rough')
    const items = await passingItems(handle.db, permit.applicationId, 'rough')
    expect(await record(id, { result: 'failed', notes: 'Wiring not accessible', items })).toEqual({
      ok: false,
      error: 'result_conflicts_items',
    })
  })

  it('fail with notes under 10 characters is notes_required', async () => {
    const permit = await newIssuedPermit(handle.db, w, 'EL')
    const id = await scheduledInspection(handle.db, w.inspector, permit.applicationId, 'rough')
    const items = [{ itemKey: 'rough-1', outcome: 'fail' as const }]
    expect(await record(id, { result: 'failed', notes: 'bad', items })).toEqual({
      ok: false,
      error: 'notes_required',
    })
  })

  it('a failed inspection stores items and notes and allows a reinspection request that links back', async () => {
    const permit = await newIssuedPermit(handle.db, w, 'EL')
    const id = await scheduledInspection(handle.db, w.inspector, permit.applicationId, 'rough')
    const items = [{ itemKey: 'rough-1', outcome: 'fail' as const, note: 'Box not secured' }]
    const r = await record(id, {
      result: 'failed',
      notes: 'Secure the panel box and call again',
      items,
    })
    expect(r).toEqual({ ok: true, value: { applicationState: 'issued', closed: false } })
    expect(await row(id)).toMatchObject({
      status: 'failed',
      resultNotes: 'Secure the panel box and call again',
      resultRecordedBy: w.inspector.userId,
    })
    const stored = await handle.db
      .select()
      .from(inspectionItemResults)
      .where(eq(inspectionItemResults.inspectionId, id))
    expect(stored).toEqual([
      expect.objectContaining({
        itemKey: 'rough-1',
        outcome: 'fail',
        note: 'Box not secured',
        required: true,
        labelSnapshot: 'Rough-in installed and accessible',
      }),
    ])
    const again = await requestInspection(
      handle.db,
      w.world.staff,
      {
        applicationId: permit.applicationId,
        checklistVersionId: await checklistIdFor(handle.db, permit.applicationId, 'rough'),
        channel: 'phone',
        contactName: 'Pat',
        reinspectionOf: id,
      },
      signal,
      deps,
    )
    expect(again.ok).toBe(true)
    const notified = await handle.db
      .select()
      .from(notificationOutbox)
      .where(eq(notificationOutbox.event, 'inspection_result'))
    expect(notified.length).toBeGreaterThan(0)
  })

  it('unknown item key is unknown_item', async () => {
    const permit = await newIssuedPermit(handle.db, w, 'EL')
    const id = await scheduledInspection(handle.db, w.inspector, permit.applicationId, 'rough')
    expect(
      await record(id, { result: 'passed', items: [{ itemKey: 'nope', outcome: 'pass' }] }),
    ).toEqual({ ok: false, error: 'unknown_item' })
  })

  it('result on a requested inspection is not_scheduled', async () => {
    const permit = await newIssuedPermit(handle.db, w, 'EL')
    const id = await scheduledInspection(handle.db, w.inspector, permit.applicationId, 'rough', {
      status: 'requested',
      inspectorUserId: null,
      scheduledDate: null,
      startMinute: null,
      durationMinutes: null,
    })
    const items = await passingItems(handle.db, permit.applicationId, 'rough')
    expect(await record(id, { result: 'passed', items })).toEqual({
      ok: false,
      error: 'not_scheduled',
    })
  })

  it('result before the scheduled date is not_scheduled', async () => {
    const permit = await newIssuedPermit(handle.db, w, 'EL')
    const id = await scheduledInspection(handle.db, w.inspector, permit.applicationId, 'rough', {
      scheduledDate: '2027-07-09',
    })
    const items = await passingItems(handle.db, permit.applicationId, 'rough')
    expect(await record(id, { result: 'passed', items })).toEqual({
      ok: false,
      error: 'not_scheduled',
    })
  })

  it('result on a suspended permit is permit_suspended', async () => {
    const permit = await newIssuedPermit(handle.db, w, 'BP')
    const id = await scheduledInspection(handle.db, w.inspector, permit.applicationId, 'footing')
    await recordAppeal(
      handle.db,
      w.world.staff,
      {
        applicationId: permit.applicationId,
        filedOn: civil('2027-07-05'),
        appellantName: 'Neighbor',
      },
      signal,
      { now: new Date('2027-12-31T17:00:00Z') },
    )
    await handle.db
      .update(inspections)
      .set({ status: 'scheduled', cancelReason: null })
      .where(eq(inspections.id, id))
    const items = await passingItems(handle.db, permit.applicationId, 'footing')
    expect(await record(id, { result: 'passed', items })).toEqual({
      ok: false,
      error: 'permit_suspended',
    })
  })

  it('result with a stale row version is stale_version', async () => {
    const permit = await newIssuedPermit(handle.db, w, 'EL')
    const id = await scheduledInspection(handle.db, w.inspector, permit.applicationId, 'rough')
    const items = await passingItems(handle.db, permit.applicationId, 'rough')
    expect(await record(id, { result: 'passed', items, expectedRowVersion: 41 })).toEqual({
      ok: false,
      error: 'stale_version',
    })
    expect((await row(id)).status).toBe('scheduled')
  })

  it('staff without inspection.record is forbidden', async () => {
    const permit = await newIssuedPermit(handle.db, w, 'EL')
    const id = await scheduledInspection(handle.db, w.inspector, permit.applicationId, 'rough')
    const items = await passingItems(handle.db, permit.applicationId, 'rough')
    expect(await record(id, { result: 'passed', items }, w.finance)).toEqual({
      ok: false,
      error: 'forbidden',
    })
    expect(await record(id, { result: 'passed', items }, w.world.reviewer)).toEqual({
      ok: false,
      error: 'forbidden',
    })
  })

  it('refuses an inspector who is not assigned, a clerk and an administrator, and lets the building official record', async () => {
    const permit = await newIssuedPermit(handle.db, w, 'EL')
    const id = await scheduledInspection(handle.db, w.inspector, permit.applicationId, 'rough')
    const items = await passingItems(handle.db, permit.applicationId, 'rough')
    for (const actor of [w.otherInspector, w.world.staff]) {
      expect(await record(id, { result: 'passed', items }, actor)).toEqual({
        ok: false,
        error: 'not_assigned',
      })
    }
    expect(await record(id, { result: 'passed', items }, w.world.admin)).toEqual({
      ok: false,
      error: 'forbidden',
    })
    expect((await row(id)).status).toBe('scheduled')
    expect((await record(id, { result: 'passed', items }, w.official)).ok).toBe(true)
  })

  it('closing cancels another open request on the permit', async () => {
    const permit = await newIssuedPermit(handle.db, w, 'EL')
    const other = await scheduledInspection(handle.db, w.inspector, permit.applicationId, 'rough')
    const id = await scheduledInspection(handle.db, w.inspector, permit.applicationId, 'final')
    const items = await passingItems(handle.db, permit.applicationId, 'final')
    expect((await record(id, { result: 'passed', items })).ok).toBe(true)
    expect(await row(other)).toMatchObject({ status: 'cancelled', cancelReason: 'permit_closed' })
  })
})

describe('inspection history', () => {
  it('lists results with items, links, and only what the viewer may see', async () => {
    const permit = await newIssuedPermit(handle.db, w, 'EL')
    const id = await scheduledInspection(handle.db, w.inspector, permit.applicationId, 'rough')
    await record(id, {
      result: 'failed',
      notes: 'Secure the panel box and call again',
      items: [{ itemKey: 'rough-1', outcome: 'fail', note: 'Box loose' }],
    })
    const asParty = await listInspectionHistory(
      handle.db,
      w.world.applicant,
      permit.applicationId,
      signal,
    )
    expect(asParty).toHaveLength(1)
    expect(asParty[0]).toMatchObject({
      id,
      status: 'failed',
      resultNotes: 'Secure the panel box and call again',
      photoCount: 0,
      items: [expect.objectContaining({ itemKey: 'rough-1', outcome: 'fail' })],
    })
    expect(
      await listInspectionHistory(handle.db, w.stranger, permit.applicationId, signal),
    ).toEqual([])
    expect(
      await listInspectionHistory(handle.db, w.world.reviewer, permit.applicationId, signal),
    ).toEqual([])
  })
})
