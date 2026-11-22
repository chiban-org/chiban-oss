import { and, eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { inspections, notificationOutbox } from '@/db/schema'
import { scheduleInspection } from '@/features/inspections/schedule'
import { createMemoryTransport } from '@/features/mail/memoryTransport'
import { sendQueuedNotifications } from '@/features/notifications/send'
import { makeTestDb, type TestDb } from '@/test/db'
import {
  civil,
  INSPECTION_NOW,
  type InspectionWorld,
  insertInspection,
  newIssuedPermit,
  setupInspectionWorld,
} from '@/test/inspectionFixtures'
import { staffActor } from '@/test/parcels'

const signal = new AbortController().signal
let handle: TestDb
let w: InspectionWorld

beforeAll(async () => {
  handle = await makeTestDb()
  w = await setupInspectionWorld(handle.db)
})
afterAll(async () => {
  await handle.drop()
})

async function rowVersion(id: string): Promise<number> {
  const [row] = await handle.db
    .select({ rowVersion: inspections.rowVersion })
    .from(inspections)
    .where(eq(inspections.id, id))
  return row?.rowVersion ?? 0
}

async function book(id: string, inspectorUserId: string, date: string, startMinute: number) {
  const booked = await scheduleInspection(
    handle.db,
    w.world.staff,
    {
      inspectionId: id,
      inspectorUserId,
      date: civil(date),
      startMinute,
      expectedRowVersion: await rowVersion(id),
    },
    signal,
    { now: INSPECTION_NOW },
  )
  expect(booked.ok).toBe(true)
}

async function queued(
  applicationId: string,
  event: 'inspection_scheduled' | 'inspection_rescheduled',
) {
  return await handle.db
    .select()
    .from(notificationOutbox)
    .where(
      and(eq(notificationOutbox.applicationId, applicationId), eq(notificationOutbox.event, event)),
    )
}

describe('moving a booked inspection', () => {
  it('a first booking queues the scheduled message and a move queues one moved message naming the earlier slot', async () => {
    const inspector = await staffActor(handle.db, 'inspector')
    const permit = await newIssuedPermit(handle.db, w, 'EL')
    const id = await insertInspection(handle.db, permit.applicationId, 'rough', {
      channel: 'phone',
    })
    await book(id, inspector.userId, '2027-07-07', 570)
    const scheduled = await queued(permit.applicationId, 'inspection_scheduled')
    expect(scheduled.length).toBeGreaterThan(0)
    expect(await queued(permit.applicationId, 'inspection_rescheduled')).toHaveLength(0)

    await book(id, inspector.userId, '2027-07-09', 630)
    const moved = await queued(permit.applicationId, 'inspection_rescheduled')
    expect(moved.map((m) => m.recipientUserId)).toEqual(scheduled.map((m) => m.recipientUserId))
    expect(await queued(permit.applicationId, 'inspection_scheduled')).toHaveLength(
      scheduled.length,
    )

    const mail = createMemoryTransport()
    await sendQueuedNotifications(handle.db, mail, signal)
    const message = mail.sent.find(
      (m) => m.subject.startsWith('Inspection moved') && m.subject.includes(permit.number),
    )
    expect(message?.text).toContain('from July 7, 2027 at 9:30 AM to July 9, 2027 at 10:30 AM')
  })
})
