import { and, eq } from 'drizzle-orm'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import {
  auditLog,
  calendarPushes,
  inspections,
  notificationOutbox,
  projectParties,
} from '@/db/schema'
import { recordAppeal } from '@/features/appeals/appeals'
import { transitionApplication } from '@/features/applications/transition'
import { availability } from '@/features/inspections/availability'
import { requestInspection } from '@/features/inspections/requestInspection'
import { cancelInspection, scheduleInspection } from '@/features/inspections/schedule'
import { createMemoryTransport } from '@/features/mail/memoryTransport'
import { sendQueuedNotifications } from '@/features/notifications/send'
import { makeTestDb, type TestDb } from '@/test/db'
import {
  checklistIdFor,
  civil,
  INSPECTION_NOW,
  type InspectionWorld,
  insertInspection,
  newIssuedPermit,
  setupInspectionWorld,
} from '@/test/inspectionFixtures'
import { staffActor } from '@/test/parcels'

const signal = new AbortController().signal
const deps = { now: INSPECTION_NOW }
let handle: TestDb
let w: InspectionWorld
let current: Awaited<ReturnType<typeof staffActor>>

beforeEach(async () => {
  current = await staffActor(handle.db, 'inspector')
})
beforeAll(async () => {
  handle = await makeTestDb()
  w = await setupInspectionWorld(handle.db)
})
afterAll(async () => {
  await handle.drop()
})

async function requested(applicationId = w.trade.applicationId, type = 'rough'): Promise<string> {
  return await insertInspection(handle.db, applicationId, type, { channel: 'phone' })
}

async function row(id: string) {
  const [r] = await handle.db.select().from(inspections).where(eq(inspections.id, id))
  if (r === undefined) throw new Error('missing inspection')
  return r
}

async function book(
  id: string,
  over: Partial<Parameters<typeof scheduleInspection>[2]> = {},
  actor: Parameters<typeof scheduleInspection>[1] = w.world.staff,
) {
  return await scheduleInspection(
    handle.db,
    actor,
    {
      inspectionId: id,
      inspectorUserId: current.userId,
      date: civil('2027-07-07'),
      startMinute: 570,
      expectedRowVersion: (await row(id)).rowVersion,
      ...over,
    },
    signal,
    deps,
  )
}

async function pushesFor(id: string) {
  return await handle.db.select().from(calendarPushes).where(eq(calendarPushes.inspectionId, id))
}

describe('scheduling', () => {
  it('scheduling a request on Wednesday 2027-07-07 at 570 is scheduled with sequence 0 and queues one publish push', async () => {
    const id = await requested()
    const r = await book(id)
    expect(r).toMatchObject({ ok: true, value: { calendarSequence: 0 } })
    expect(await row(id)).toMatchObject({
      status: 'scheduled',
      scheduledDate: '2027-07-07',
      startMinute: 570,
      durationMinutes: 60,
      calendarSequence: 0,
    })
    const pushes = await pushesFor(id)
    expect(pushes).toHaveLength(1)
    expect(pushes[0]).toMatchObject({
      op: 'publish',
      sequence: 0,
      inspectorUserId: current.userId,
    })
  })

  it('rescheduling moves the slot, sets sequence 1, and queues a publish push with sequence 1', async () => {
    const id = await requested()
    await book(id)
    const r = await book(id, { date: civil('2027-07-09'), startMinute: 630 })
    expect(r).toMatchObject({ ok: true, value: { calendarSequence: 1 } })
    expect(await row(id)).toMatchObject({ scheduledDate: '2027-07-09', startMinute: 630 })
    const pushes = (await pushesFor(id)).filter((p) => p.op === 'publish')
    expect(pushes.map((p) => p.sequence).sort()).toEqual([0, 1])
  })

  it('changing inspector queues cancel for the old and publish for the new', async () => {
    const id = await requested()
    await book(id)
    await book(id, { inspectorUserId: w.otherInspector.userId, date: civil('2027-07-09') })
    const pushes = await pushesFor(id)
    const cancel = pushes.find((p) => p.op === 'cancel')
    expect(cancel).toMatchObject({
      inspectorUserId: current.userId,
      scheduledDate: '2027-07-07',
      startMinute: 570,
      sequence: 0,
    })
    const publishNew = pushes.find(
      (p) => p.op === 'publish' && p.inspectorUserId === w.otherInspector.userId,
    )
    expect(publishNew).toMatchObject({ sequence: 1, scheduledDate: '2027-07-09' })
  })

  it('start 600 is slot_not_on_grid', async () => {
    const id = await requested()
    expect(await book(id, { startMinute: 600 })).toEqual({ ok: false, error: 'slot_not_on_grid' })
  })

  it('start 600 with an off-grid reason books and records the reason', async () => {
    const id = await requested()
    const reason = 'Contractor can only meet at ten'
    const r = await book(id, { startMinute: 600, offGrid: { reason } })
    expect(r.ok).toBe(true)
    expect((await row(id)).offGridReason).toBe(reason)
    const audits = await handle.db.select().from(auditLog).where(eq(auditLog.entityId, id))
    expect(JSON.stringify(audits.map((a) => a.after))).toContain(reason)
  })

  it('an off-grid reason shorter than 10 characters does not unlock the grid', async () => {
    const id = await requested()
    expect(await book(id, { startMinute: 600, offGrid: { reason: 'too short' } })).toEqual({
      ok: false,
      error: 'slot_not_on_grid',
    })
  })

  it('a Tuesday booking with an off-grid reason books; without one it is date_unavailable', async () => {
    const id = await requested()
    expect(await book(id, { date: civil('2027-07-06') })).toEqual({
      ok: false,
      error: 'date_unavailable',
    })
    const r = await book(id, {
      date: civil('2027-07-06'),
      offGrid: { reason: 'Inspector available Tuesday' },
    })
    expect(r.ok).toBe(true)
  })

  it('a seventh booking for one inspector on one day is inspector_full', async () => {
    const inspector = await staffActor(handle.db, 'inspector')
    for (const start of [570, 630, 690, 750, 810, 870]) {
      const id = await requested()
      expect(
        (
          await book(id, {
            inspectorUserId: inspector.userId,
            date: civil('2027-07-14'),
            startMinute: start,
          })
        ).ok,
      ).toBe(true)
    }
    const seventh = await requested()
    const r = await book(seventh, {
      inspectorUserId: inspector.userId,
      date: civil('2027-07-14'),
      startMinute: 540,
      offGrid: { reason: 'Squeezing one more in' },
    })
    expect(r).toEqual({ ok: false, error: 'inspector_full' })
  })

  it('eight concurrent bookings of one slot yield one booking', async () => {
    const inspector = await staffActor(handle.db, 'inspector')
    const ids = await Promise.all(Array.from({ length: 8 }, () => requested()))
    const versions = await Promise.all(ids.map(async (id) => (await row(id)).rowVersion))
    const results = await Promise.all(
      ids.map((id, i) =>
        scheduleInspection(
          handle.db,
          w.world.staff,
          {
            inspectionId: id,
            inspectorUserId: inspector.userId,
            date: civil('2027-07-16'),
            startMinute: 570,
            expectedRowVersion: versions[i] ?? 1,
          },
          signal,
          deps,
        ),
      ),
    )
    expect(results.filter((r) => r.ok)).toHaveLength(1)
    expect(results.filter((r) => !r.ok && r.error === 'slot_taken')).toHaveLength(7)
  })

  it('assigning a finance user is not_an_inspector', async () => {
    const id = await requested()
    expect(await book(id, { inspectorUserId: w.finance.userId })).toEqual({
      ok: false,
      error: 'not_an_inspector',
    })
  })

  it('stale row version is stale_version', async () => {
    const id = await requested()
    expect(await book(id, { expectedRowVersion: 99 })).toEqual({
      ok: false,
      error: 'stale_version',
    })
  })

  it('a reviewer and finance may not schedule', async () => {
    const id = await requested()
    expect(await book(id, {}, w.world.reviewer)).toEqual({ ok: false, error: 'forbidden' })
    expect(await book(id, {}, w.finance)).toEqual({ ok: false, error: 'forbidden' })
  })

  it('a passed inspection is not_schedulable', async () => {
    const id = await insertInspection(handle.db, w.trade.applicationId, 'rough', {
      status: 'passed',
    })
    expect(await book(id)).toEqual({ ok: false, error: 'not_schedulable' })
  })

  it('a cancelled request frees its slot', async () => {
    const inspector = await staffActor(handle.db, 'inspector')
    const first = await requested()
    const second = await requested()
    const slot = { inspectorUserId: inspector.userId, date: civil('2027-07-19'), startMinute: 570 }
    expect((await book(first, slot)).ok).toBe(true)
    expect(await book(second, slot)).toEqual({ ok: false, error: 'slot_taken' })
    const cancelled = await cancelInspection(
      handle.db,
      w.world.staff,
      { inspectionId: first, reason: 'staff', expectedRowVersion: (await row(first)).rowVersion },
      signal,
    )
    expect(cancelled.ok).toBe(true)
    expect((await book(second, slot)).ok).toBe(true)
    expect((await pushesFor(first)).some((p) => p.op === 'cancel')).toBe(true)
  })
})

describe('cancelling', () => {
  it('the requesting applicant can cancel their own portal request; another applicant gets not_found', async () => {
    const permit = await newIssuedPermit(handle.db, w, 'EL')
    const made = await requestInspection(
      handle.db,
      w.world.applicant,
      {
        applicationId: permit.applicationId,
        checklistVersionId: await checklistIdFor(handle.db, permit.applicationId, 'rough'),
        channel: 'portal',
        contactName: 'Alex',
      },
      signal,
      deps,
    )
    if (!made.ok) throw new Error('request failed')
    const id = made.value.inspectionId
    const version = (await row(id)).rowVersion
    const other = await cancelInspection(
      handle.db,
      w.stranger,
      { inspectionId: id, reason: 'requester', expectedRowVersion: version },
      signal,
    )
    expect(other).toEqual({ ok: false, error: 'not_found' })
    const mine = await cancelInspection(
      handle.db,
      w.world.applicant,
      { inspectionId: id, reason: 'requester', expectedRowVersion: version },
      signal,
    )
    expect(mine.ok).toBe(true)
    expect(await row(id)).toMatchObject({ status: 'cancelled', cancelReason: 'requester' })
  })

  it('a party cannot cancel a phone request made by staff', async () => {
    const id = await requested()
    const r = await cancelInspection(
      handle.db,
      w.world.applicant,
      { inspectionId: id, reason: 'requester', expectedRowVersion: 1 },
      signal,
    )
    expect(r).toEqual({ ok: false, error: 'not_found' })
  })
})

describe('permit state effects', () => {
  it('recording an appeal cancels scheduled inspections and pushes cancels', async () => {
    const permit = await newIssuedPermit(handle.db, w, 'BP')
    const a = await insertInspection(handle.db, permit.applicationId, 'footing')
    const b = await insertInspection(handle.db, permit.applicationId, 'framing')
    expect((await book(a)).ok).toBe(true)
    expect((await book(b, { startMinute: 630 })).ok).toBe(true)
    const appeal = await recordAppeal(
      handle.db,
      w.world.staff,
      {
        applicationId: permit.applicationId,
        filedOn: civil('2027-07-02'),
        appellantName: 'Neighbor',
      },
      signal,
    )
    expect(appeal.ok).toBe(true)
    for (const id of [a, b]) {
      expect(await row(id)).toMatchObject({ status: 'cancelled', cancelReason: 'permit_suspended' })
      expect((await pushesFor(id)).filter((p) => p.op === 'cancel')).toHaveLength(1)
    }
    const notices = await handle.db
      .select()
      .from(notificationOutbox)
      .where(
        and(
          eq(notificationOutbox.applicationId, permit.applicationId),
          eq(notificationOutbox.event, 'inspection_cancelled'),
        ),
      )
    expect(notices.length).toBeGreaterThanOrEqual(2)
    const fresh = await requestInspection(
      handle.db,
      w.world.staff,
      {
        applicationId: permit.applicationId,
        checklistVersionId: await checklistIdFor(handle.db, permit.applicationId, 'footing'),
        channel: 'phone',
        contactName: 'Pat',
      },
      signal,
      deps,
    )
    expect(fresh).toEqual({ ok: false, error: 'permit_suspended' })
    const again = await insertInspection(handle.db, permit.applicationId, 'foundation')
    expect(await book(again)).toEqual({ ok: false, error: 'permit_suspended' })
  })

  it('expiring a permit cancels its scheduled inspection with permit_expired', async () => {
    const permit = await newIssuedPermit(handle.db, w, 'EL')
    const id = await requested(permit.applicationId)
    await book(id)
    const result = await handle.db.transaction((tx) =>
      transitionApplication(
        tx,
        { kind: 'system', job: 'clocks.daily' },
        {
          applicationId: permit.applicationId,
          to: 'expired',
          expectedRowVersion: 1,
          onDate: civil('2027-07-03'),
        },
        signal,
      ),
    )
    expect(result.ok).toBe(true)
    expect(await row(id)).toMatchObject({ status: 'cancelled', cancelReason: 'permit_expired' })
  })

  it('closing a permit cancels its open requests with permit_closed', async () => {
    const permit = await newIssuedPermit(handle.db, w, 'EL')
    const id = await requested(permit.applicationId)
    const result = await handle.db.transaction((tx) =>
      transitionApplication(
        tx,
        w.world.staff,
        {
          applicationId: permit.applicationId,
          to: 'closed',
          expectedRowVersion: 1,
          onDate: civil('2027-07-03'),
        },
        signal,
      ),
    )
    expect(result.ok).toBe(true)
    expect(await row(id)).toMatchObject({ status: 'cancelled', cancelReason: 'permit_closed' })
  })
})

describe('notifications', () => {
  it('scheduling queues inspection_scheduled for parties and none is sent to a removed party', async () => {
    const permit = await newIssuedPermit(handle.db, w, 'EL')
    const id = await requested(permit.applicationId)
    await book(id)
    const queued = await handle.db
      .select()
      .from(notificationOutbox)
      .where(
        and(
          eq(notificationOutbox.applicationId, permit.applicationId),
          eq(notificationOutbox.event, 'inspection_scheduled'),
        ),
      )
    expect(queued.map((q) => q.recipientUserId)).toContain(w.world.applicant.userId)
    await handle.db
      .update(projectParties)
      .set({ removedAt: new Date() })
      .where(eq(projectParties.userId, w.world.applicant.userId))
    const mail = createMemoryTransport()
    await sendQueuedNotifications(handle.db, mail, signal)
    expect(mail.sent.filter((m) => m.subject.startsWith('Inspection scheduled'))).toHaveLength(0)
    await handle.db
      .update(projectParties)
      .set({ removedAt: null })
      .where(eq(projectParties.userId, w.world.applicant.userId))
  })

  it('the scheduled message names the permit, the type, the date, and the time', async () => {
    const permit = await newIssuedPermit(handle.db, w, 'EL')
    const id = await requested(permit.applicationId, 'final')
    await book(id, { date: civil('2027-07-12'), startMinute: 810 })
    const mail = createMemoryTransport()
    await sendQueuedNotifications(handle.db, mail, signal)
    const message = mail.sent.find((m) => m.subject.includes(permit.number))
    expect(message?.subject).toBe(
      `Inspection scheduled: ${permit.number}, Final on July 12, 2027 at 1:30 PM`,
    )
  })
})

describe('availability', () => {
  it('availability lists free starts only on scheduling days', async () => {
    const inspector = await staffActor(handle.db, 'inspector')
    const id = await requested()
    await book(id, {
      inspectorUserId: inspector.userId,
      date: civil('2027-07-21'),
      startMinute: 570,
    })
    const days = await availability(
      handle.db,
      { inspectorUserId: inspector.userId, from: civil('2027-07-19'), to: civil('2027-07-23') },
      civil('2027-07-01'),
      signal,
    )
    expect(days.map((d) => d.date)).toEqual(['2027-07-19', '2027-07-21', '2027-07-23'])
    const wednesday = days.find((d) => d.date === '2027-07-21')
    expect(wednesday).toMatchObject({ booked: 1, freeStarts: [630, 690, 750, 810, 870] })
    expect(days.find((d) => d.date === '2027-07-19')?.freeStarts).toHaveLength(6)
  })
})
