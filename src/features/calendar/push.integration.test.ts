import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { calendarPushes, inspections, inspectorCalendars, users } from '@/db/schema'
import { transactionResult } from '@/db/transactionResult'
import { deliverPush } from '@/features/calendar/deliverPush'
import { createIcsEmailPublisher } from '@/features/calendar/icsEmailPublisher'
import type { CalendarPublisher } from '@/features/calendar/publisher'
import { overdueCalendarPushes, queueCalendarPush } from '@/features/calendar/queuePush'
import { createMemoryTransport } from '@/features/mail/memoryTransport'
import { makeCalendarPushJob } from '@/jobs/calendarPush'
import { runJob } from '@/jobs/defineJob'
import { makeTestDb, type TestDb } from '@/test/db'
import {
  civil,
  INSPECTION_NOW,
  type InspectionWorld,
  insertInspection,
  setupInspectionWorld,
} from '@/test/inspectionFixtures'
import { err, ok } from '@/types/result'

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

async function scheduled(date = '2027-11-08', start = 570): Promise<string> {
  return await insertInspection(handle.db, w.trade.applicationId, 'final', {
    status: 'scheduled',
    inspectorUserId: w.inspector.userId,
    scheduledDate: date,
    startMinute: start,
    durationMinutes: 60,
  })
}

async function queue(inspectionId: string, sequence: number, op: 'publish' | 'cancel') {
  const pushId = await transactionResult(handle.db, async (tx) =>
    ok(
      await queueCalendarPush(
        tx,
        { inspectionId, sequence, op, inspectorUserId: w.inspector.userId },
        signal,
      ),
    ),
  )
  if (!pushId.ok || pushId.value === null) throw new Error('queue failed')
  return pushId.value
}

function deps(mail = createMemoryTransport()) {
  const publisher = createIcsEmailPublisher({ mail, organizerEmail: 'noreply@alderpond.example' })
  return { mail, deps: { publisherFor: () => publisher, now: INSPECTION_NOW } }
}

describe('calendar push outbox', () => {
  it('publish push mails METHOD:REQUEST to the inspector with the booking time in UTC', async () => {
    const id = await scheduled('2027-11-08', 570)
    const pushId = await queue(id, 0, 'publish')
    const { mail, deps: d } = deps()
    const result = await deliverPush(handle.db, d, pushId, signal)
    expect(result).toEqual({ ok: true, value: 'sent' })
    const [email] = await handle.db
      .select({ email: users.email })
      .from(users)
      .where(eq(users.id, w.inspector.userId))
    expect(mail.sent).toHaveLength(1)
    expect(mail.sent[0]?.to).toBe(email?.email)
    expect(mail.sent[0]?.icalEvent?.method).toBe('REQUEST')
    expect(mail.sent[0]?.icalEvent?.content).toContain('DTSTART:20271108T143000Z')
    expect(mail.sent[0]?.icalEvent?.content).toContain('SEQUENCE:0')
  })

  it('delivering the same push twice sends once', async () => {
    const id = await scheduled('2027-11-10', 570)
    const pushId = await queue(id, 0, 'publish')
    const { mail, deps: d } = deps()
    await deliverPush(handle.db, d, pushId, signal)
    const again = await deliverPush(handle.db, d, pushId, signal)
    expect(again).toEqual({ ok: true, value: 'skipped' })
    expect(mail.sent).toHaveLength(1)
  })

  it('a superseded publish is marked sent without mail', async () => {
    const id = await scheduled('2027-11-12', 570)
    const pushId = await queue(id, 0, 'publish')
    await handle.db.update(inspections).set({ calendarSequence: 1 }).where(eq(inspections.id, id))
    const { mail, deps: d } = deps()
    expect(await deliverPush(handle.db, d, pushId, signal)).toEqual({
      ok: true,
      value: 'superseded',
    })
    expect(mail.sent).toHaveLength(0)
    const [row] = await handle.db.select().from(calendarPushes).where(eq(calendarPushes.id, pushId))
    expect(row?.status).toBe('sent')
  })

  it('cancel push mails METHOD:CANCEL with sequence plus one', async () => {
    const id = await scheduled('2027-11-15', 570)
    const pushId = await queue(id, 2, 'cancel')
    const { mail, deps: d } = deps()
    await deliverPush(handle.db, d, pushId, signal)
    expect(mail.sent[0]?.icalEvent?.method).toBe('CANCEL')
    expect(mail.sent[0]?.icalEvent?.content).toContain('SEQUENCE:3')
    expect(mail.sent[0]?.icalEvent?.content).toContain('STATUS:CANCELLED')
  })

  it('a cancel push keeps the slot it was queued for after a reschedule', async () => {
    const id = await scheduled('2027-11-17', 630)
    const pushId = await queue(id, 0, 'cancel')
    await handle.db
      .update(inspections)
      .set({ scheduledDate: '2027-11-19', startMinute: 750 })
      .where(eq(inspections.id, id))
    const { mail, deps: d } = deps()
    await deliverPush(handle.db, d, pushId, signal)
    expect(mail.sent[0]?.icalEvent?.content).toContain('DTSTART:20271117T153000Z')
  })

  it('a send failure retries and is failed after 5 attempts', async () => {
    const id = await scheduled('2027-11-22', 570)
    const pushId = await queue(id, 0, 'publish')
    const failing: CalendarPublisher = {
      kind: 'ics_email',
      publish: () => Promise.resolve(err({ kind: 'unreachable' as const, detail: 'smtp down' })),
      cancel: () => Promise.resolve(err({ kind: 'unreachable' as const, detail: 'smtp down' })),
    }
    const d = { publisherFor: () => failing, now: INSPECTION_NOW }
    for (let attempt = 1; attempt <= 4; attempt += 1) {
      const r = await deliverPush(handle.db, d, pushId, signal)
      expect(r.ok).toBe(false)
      const [row] = await handle.db
        .select()
        .from(calendarPushes)
        .where(eq(calendarPushes.id, pushId))
      expect(row).toMatchObject({ status: 'queued', attempts: attempt, lastError: 'smtp down' })
    }
    await deliverPush(handle.db, d, pushId, signal)
    const [row] = await handle.db.select().from(calendarPushes).where(eq(calendarPushes.id, pushId))
    expect(row).toMatchObject({ status: 'failed', attempts: 5 })
  })

  it('sweep finds a queued push older than the threshold and leaves a fresh one', async () => {
    const oldId = await scheduled('2027-11-24', 570)
    const freshId = await scheduled('2027-11-26', 570)
    const oldPush = await queue(oldId, 0, 'publish')
    const freshPush = await queue(freshId, 0, 'publish')
    await handle.db
      .update(calendarPushes)
      .set({ createdAt: new Date(INSPECTION_NOW.getTime() - 6 * 60_000) })
      .where(eq(calendarPushes.id, oldPush))
    await handle.db
      .update(calendarPushes)
      .set({ createdAt: new Date(INSPECTION_NOW.getTime() - 30_000) })
      .where(eq(calendarPushes.id, freshPush))
    const overdue = await overdueCalendarPushes(handle.db, INSPECTION_NOW, signal)
    expect(overdue.map((p) => p.id)).toContain(oldPush)
    expect(overdue.map((p) => p.id)).not.toContain(freshPush)
  })

  it('inspector without a calendar row receives at their account email; a row overrides it', async () => {
    const id = await scheduled('2027-11-29', 570)
    const first = await queue(id, 0, 'publish')
    const { mail, deps: d } = deps()
    await deliverPush(handle.db, d, first, signal)
    const [account] = await handle.db
      .select({ email: users.email })
      .from(users)
      .where(eq(users.id, w.inspector.userId))
    expect(mail.sent[0]?.to).toBe(account?.email)
    await handle.db.insert(inspectorCalendars).values({
      userId: w.inspector.userId,
      kind: 'ics_email',
      email: 'field-calendar@alderpond.example',
      updatedBy: w.inspector.userId,
    })
    const second = await queue(id, 1, 'publish')
    await handle.db.update(inspections).set({ calendarSequence: 1 }).where(eq(inspections.id, id))
    await deliverPush(handle.db, d, second, signal)
    expect(mail.sent[1]?.to).toBe('field-calendar@alderpond.example')
  })

  it('queueing the same push twice yields one row', async () => {
    const id = await scheduled('2027-12-01', 570)
    const a = await queue(id, 0, 'publish')
    const again = await transactionResult(handle.db, async (tx) =>
      ok(
        await queueCalendarPush(
          tx,
          { inspectionId: id, sequence: 0, op: 'publish', inspectorUserId: w.inspector.userId },
          signal,
        ),
      ),
    )
    expect(a).toBeTruthy()
    expect(again.ok && again.value).toBeNull()
    void civil
  })

  it('the push job delivers through the job runner, and a failing mail server keeps the attempt count', async () => {
    const id = await scheduled('2027-12-03', 570)
    const pushId = await queue(id, 0, 'publish')
    const down = { send: () => Promise.resolve(err('send_failed' as const)) }
    const failed = await runJob(
      handle.db,
      makeCalendarPushJob({ mail: down, now: () => INSPECTION_NOW }),
      { pushId, attempts: 0 },
      signal,
    )
    expect(failed.ok).toBe(false)
    const [afterFailure] = await handle.db
      .select()
      .from(calendarPushes)
      .where(eq(calendarPushes.id, pushId))
    expect(afterFailure).toMatchObject({ status: 'queued', attempts: 1 })
    const mail = createMemoryTransport()
    const delivered = await runJob(
      handle.db,
      makeCalendarPushJob({ mail, now: () => INSPECTION_NOW }),
      { pushId, attempts: 1 },
      signal,
    )
    expect(delivered.ok).toBe(true)
    expect(mail.sent).toHaveLength(1)
  })
})
