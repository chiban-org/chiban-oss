import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { loadInspectionsPanelData } from '@/app/(staff)/staff/applications/[applicationId]/inspectionsPanel'
import { applications, inspections, projectParties, users } from '@/db/schema'
import { transactionResult } from '@/db/transactionResult'
import { deliverPush } from '@/features/calendar/deliverPush'
import { createIcsEmailPublisher } from '@/features/calendar/icsEmailPublisher'
import type { CalendarPublisher } from '@/features/calendar/publisher'
import { queueCalendarPush } from '@/features/calendar/queuePush'
import { availability } from '@/features/inspections/availability'
import { loadInspectionView } from '@/features/inspections/inspectionView'
import { requestInspection } from '@/features/inspections/requestInspection'
import { cancelInspection, scheduleInspection } from '@/features/inspections/schedule'
import { createMemoryTransport } from '@/features/mail/memoryTransport'
import { makeTestDb, type TestDb } from '@/test/db'
import {
  checklistIdFor,
  civil,
  INSPECTION_NOW,
  type InspectionWorld,
  insertInspection,
  newIssuedPermit,
  RESULT_NOW,
  scheduledInspection,
  setupInspectionWorld,
} from '@/test/inspectionFixtures'
import { staffActor } from '@/test/parcels'
import { err, ok } from '@/types/result'

const signal = new AbortController().signal
const deps = { now: INSPECTION_NOW }
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

async function book(id: string, inspectorUserId: string, startMinute: number, offGrid?: string) {
  return await scheduleInspection(
    handle.db,
    w.world.staff,
    {
      inspectionId: id,
      inspectorUserId,
      date: civil('2027-07-07'),
      startMinute,
      expectedRowVersion: (await row(id)).rowVersion,
      ...(offGrid === undefined ? {} : { offGrid: { reason: offGrid } }),
    },
    signal,
    deps,
  )
}

describe('review finding: cancelling after losing access', () => {
  it('a removed party can no longer cancel their portal request', async () => {
    const permit = await newIssuedPermit(handle.db, w, 'EL')
    const id = await insertInspection(handle.db, permit.applicationId, 'rough', {
      channel: 'portal',
      requestedByUserId: w.world.applicant.userId,
    })
    await handle.db
      .update(projectParties)
      .set({ removedAt: new Date() })
      .where(eq(projectParties.userId, w.world.applicant.userId))
    const r = await cancelInspection(
      handle.db,
      w.world.applicant,
      { inspectionId: id, reason: 'requester', expectedRowVersion: 1 },
      signal,
    )
    await handle.db
      .update(projectParties)
      .set({ removedAt: null })
      .where(eq(projectParties.userId, w.world.applicant.userId))
    expect(r).toEqual({ ok: false, error: 'not_found' })
  })
})

describe('review finding: overlapping bookings', () => {
  it('an off-grid start inside another booking is slot_taken, and availability hides overlapped starts', async () => {
    const inspector = await staffActor(handle.db, 'inspector')
    const permit = await newIssuedPermit(handle.db, w, 'EL')
    const a = await insertInspection(handle.db, permit.applicationId, 'rough')
    const b = await insertInspection(handle.db, permit.applicationId, 'final')
    expect((await book(a, inspector.userId, 570)).ok).toBe(true)
    expect(await book(b, inspector.userId, 600, 'Contractor asked for ten')).toEqual({
      ok: false,
      error: 'slot_taken',
    })
    expect((await book(b, inspector.userId, 630)).ok).toBe(true)
    const days = await availability(
      handle.db,
      { inspectorUserId: inspector.userId, from: civil('2027-07-07'), to: civil('2027-07-07') },
      civil('2027-07-01'),
      signal,
    )
    expect(days[0]?.freeStarts).toEqual([690, 750, 810, 870])
  })
})

describe('review finding: closed permits take no new bookings', () => {
  it('scheduling a request on a permit that is no longer issued is not_schedulable', async () => {
    const permit = await newIssuedPermit(handle.db, w, 'EL')
    const id = await insertInspection(handle.db, permit.applicationId, 'rough')
    await handle.db
      .update(applications)
      .set({ state: 'closed' })
      .where(eq(applications.id, permit.applicationId))
    const inspector = await staffActor(handle.db, 'inspector')
    expect(await book(id, inspector.userId, 570)).toEqual({ ok: false, error: 'not_schedulable' })
  })

  it('a request on a closed permit is not_issued', async () => {
    const permit = await newIssuedPermit(handle.db, w, 'EL')
    await handle.db
      .update(applications)
      .set({ state: 'closed' })
      .where(eq(applications.id, permit.applicationId))
    const r = await requestInspection(
      handle.db,
      w.world.staff,
      {
        applicationId: permit.applicationId,
        checklistVersionId: await checklistIdFor(handle.db, permit.applicationId, 'rough'),
        channel: 'phone',
        contactName: 'Pat',
      },
      signal,
      deps,
    )
    expect(r).toEqual({ ok: false, error: 'not_issued' })
  })
})

describe('review finding: calendar delivery', () => {
  async function pushFor(
    inspectionId: string,
    inspectorUserId: string,
    sequence: number,
    op: 'publish' | 'cancel',
  ) {
    const id = await transactionResult(handle.db, async (tx) =>
      ok(await queueCalendarPush(tx, { inspectionId, sequence, op, inspectorUserId }, signal)),
    )
    if (!id.ok || id.value === null) throw new Error('queue failed')
    return id.value
  }

  it('a deactivated inspector receives nothing', async () => {
    const inspector = await staffActor(handle.db, 'inspector')
    const permit = await newIssuedPermit(handle.db, w, 'EL')
    const id = await scheduledInspection(handle.db, inspector, permit.applicationId, 'rough')
    const pushId = await pushFor(id, inspector.userId, 0, 'publish')
    await handle.db.update(users).set({ isActive: false }).where(eq(users.id, inspector.userId))
    const mail = createMemoryTransport()
    const publisher = createIcsEmailPublisher({ mail, organizerEmail: 'noreply@alderpond.example' })
    const r = await deliverPush(
      handle.db,
      { publisherFor: () => publisher, now: INSPECTION_NOW },
      pushId,
      signal,
    )
    expect(r).toEqual({ ok: true, value: 'superseded' })
    expect(mail.sent).toHaveLength(0)
  })

  it('reassigning back to the first inspector publishes a new event instead of patching a deleted one', async () => {
    const inspector = await staffActor(handle.db, 'inspector')
    const permit = await newIssuedPermit(handle.db, w, 'EL')
    const id = await scheduledInspection(handle.db, inspector, permit.applicationId, 'rough')
    const seen: (string | null)[] = []
    const publisher: CalendarPublisher = {
      kind: 'graph',
      publish: (_b, previous) => {
        seen.push(previous)
        return Promise.resolve(ok({ externalRef: `event-${seen.length}` }))
      },
      cancel: () => Promise.resolve(ok(undefined)),
    }
    const d = { publisherFor: () => publisher, now: INSPECTION_NOW }
    await deliverPush(handle.db, d, await pushFor(id, inspector.userId, 0, 'publish'), signal)
    await deliverPush(handle.db, d, await pushFor(id, inspector.userId, 0, 'cancel'), signal)
    await handle.db.update(inspections).set({ calendarSequence: 2 }).where(eq(inspections.id, id))
    await deliverPush(handle.db, d, await pushFor(id, inspector.userId, 2, 'publish'), signal)
    expect(seen).toEqual([null, null])
  })

  it('a publish that fails still reports the error', async () => {
    const inspector = await staffActor(handle.db, 'inspector')
    const permit = await newIssuedPermit(handle.db, w, 'EL')
    const id = await scheduledInspection(handle.db, inspector, permit.applicationId, 'rough')
    const failing: CalendarPublisher = {
      kind: 'graph',
      publish: () => Promise.resolve(err({ kind: 'rejected' as const, detail: 'no' })),
      cancel: () => Promise.resolve(ok(undefined)),
    }
    const r = await deliverPush(
      handle.db,
      { publisherFor: () => failing, now: INSPECTION_NOW },
      await pushFor(id, inspector.userId, 0, 'publish'),
      signal,
    )
    expect(r.ok).toBe(false)
  })
})

describe('review finding: photos after a result and certificate readiness', () => {
  it('the inspector can still add photos within seven days of a recorded result', async () => {
    const permit = await newIssuedPermit(handle.db, w, 'EL')
    const id = await scheduledInspection(handle.db, w.inspector, permit.applicationId, 'rough')
    await handle.db
      .update(inspections)
      .set({
        status: 'failed',
        resultRecordedAt: new Date(RESULT_NOW.getTime() - 86_400_000),
        resultNotes: 'Needs work here',
      })
      .where(eq(inspections.id, id))
    const view = await loadInspectionView(handle.db, w.inspector, id, signal, RESULT_NOW)
    expect(view.ok && view.value.canAddPhotos).toBe(true)
    expect(view.ok && view.value.canRecord).toBe(false)
  })

  it('certificate readiness follows result order, not request order', async () => {
    const permit = await newIssuedPermit(handle.db, w, 'BP')
    const first = await insertInspection(handle.db, permit.applicationId, 'final', {
      status: 'passed',
      resultRecordedAt: new Date('2027-07-08T12:00:00Z'),
    })
    await insertInspection(handle.db, permit.applicationId, 'final', {
      status: 'failed',
      resultRecordedAt: new Date('2027-07-06T12:00:00Z'),
    })
    const data = await loadInspectionsPanelData(
      { db: handle.db, actor: w.world.staff, signal },
      permit.applicationId,
    )
    expect(data.certificateReady).toBe(true)
    void first
  })
})
