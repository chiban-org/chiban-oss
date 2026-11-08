import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { reportScheduleDeliveries, reportSchedules, users } from '@/db/schema'
import { createMemoryTransport } from '@/features/mail/memoryTransport'
import type { MailTransport } from '@/features/mail/transport'
import { sendDueReports } from '@/features/reports/scheduledSend'
import { createSchedule, setSchedulePaused, updateSchedule } from '@/features/reports/schedules'
import { makeApplication, type PermitWorld, setupPermitWorld } from '@/test/applicationFixtures'
import { makeTestDb, type TestDb } from '@/test/db'
import { staffActor } from '@/test/parcels'
import { err } from '@/types/result'

const signal = new AbortController().signal
const OCT_15 = new Date('2026-10-15T15:00:00Z')
const OCT_31_EVENING = new Date('2026-10-31T23:00:00Z')
const NOV_1_MORNING = new Date('2026-11-01T12:00:00Z')
let handle: TestDb
let world: PermitWorld
let finance: Awaited<ReturnType<typeof staffActor>>

beforeAll(async () => {
  handle = await makeTestDb()
  world = await setupPermitWorld(handle.db)
  finance = await staffActor(handle.db, 'finance')
  await makeApplication(handle.db, world, { receivedDate: '2026-10-05' })
})
afterAll(async () => {
  await handle.drop()
})

async function schedule(input: Parameters<typeof createSchedule>[2]) {
  const made = await createSchedule(handle.db, world.staff, { now: OCT_15, ...input }, signal)
  if (!made.ok) throw new Error(JSON.stringify(made.error))
  return made.value.id
}

const run = (mail: MailTransport, now: Date) => sendDueReports({ db: handle.db, mail, signal, now })

async function emailOf(userId: string): Promise<string> {
  const [row] = await handle.db
    .select({ email: users.email })
    .from(users)
    .where(eq(users.id, userId))
  return row?.email ?? ''
}

async function scheduleRow(id: string) {
  const [row] = await handle.db.select().from(reportSchedules).where(eq(reportSchedules.id, id))
  return row
}

describe('scheduled report delivery', () => {
  it('waits for the run day in the town time zone, then mails each recipient both files', async () => {
    const id = await schedule({
      report: 'permit-volume',
      frequency: 'monthly',
      recipientIds: [world.staff.userId, world.admin.userId],
    })
    const mail = createMemoryTransport()
    expect(await run(mail, OCT_31_EVENING)).toEqual({ ok: true, value: { sent: 0 } })
    expect(await run(mail, NOV_1_MORNING)).toEqual({ ok: true, value: { sent: 2 } })
    expect(mail.sent.map((m) => m.to).sort()).toEqual(
      [await emailOf(world.staff.userId), await emailOf(world.admin.userId)].sort(),
    )
    const first = mail.sent[0]
    expect(first?.subject).toBe('Permit volume: October 2026')
    expect(first?.attachments?.map((a) => a.filename)).toEqual([
      'permit-volume-2026-10-01-to-2026-10-31.csv',
      'permit-volume-2026-10-01-to-2026-10-31.xlsx',
    ])
    expect(first?.attachments?.[0]?.content.toString('utf8')).toContain('2026-10,BP,1,')
    expect(first?.text).toContain('/staff/reports?from=2026-10-01&to=2026-10-31')
    expect(await scheduleRow(id)).toMatchObject({
      nextRunOn: '2026-12-01',
      lastPeriodFrom: '2026-10-01',
      lastPeriodTo: '2026-10-31',
    })
    expect((await scheduleRow(id))?.lastSentAt).not.toBeNull()
    expect(await run(mail, NOV_1_MORNING)).toEqual({ ok: true, value: { sent: 0 } })
    await setSchedulePaused(handle.db, world.staff, { id, paused: true }, signal)
  })

  it('skips a recipient who can no longer see the report and still moves on', async () => {
    const id = await schedule({
      report: 'revenue',
      frequency: 'weekly',
      recipientIds: [world.staff.userId, finance.userId],
    })
    await handle.db.update(users).set({ isActive: false }).where(eq(users.id, finance.userId))
    const mail = createMemoryTransport()
    const monday = new Date('2026-10-19T12:00:00Z')
    expect(await run(mail, monday)).toEqual({ ok: true, value: { sent: 1 } })
    expect(mail.sent[0]?.subject).toBe('Revenue: Week of October 12, 2026')
    const skipped = await handle.db
      .select()
      .from(reportScheduleDeliveries)
      .where(eq(reportScheduleDeliveries.userId, finance.userId))
    expect(skipped.map((d) => d.outcome)).toEqual(['skipped_no_access'])
    expect((await scheduleRow(id))?.nextRunOn).toBe('2026-10-26')
    await handle.db.update(users).set({ isActive: true }).where(eq(users.id, finance.userId))
    await setSchedulePaused(handle.db, world.staff, { id, paused: true }, signal)
  })

  it('retries only the recipient whose mail failed, for the same period', async () => {
    const id = await schedule({
      report: 'processing-time',
      frequency: 'quarterly',
      recipientIds: [world.staff.userId, world.admin.userId],
    })
    const adminEmail = await emailOf(world.admin.userId)
    const flaky = createMemoryTransport()
    const failing: MailTransport = {
      send: (message, s) =>
        message.to === adminEmail ? Promise.resolve(err('send_failed')) : flaky.send(message, s),
    }
    const january = new Date('2027-01-01T15:00:00Z')
    const first = await run(failing, january)
    expect(first.ok).toBe(false)
    expect(flaky.sent).toHaveLength(1)
    expect((await scheduleRow(id))?.nextRunOn).toBe('2027-01-01')
    const healthy = createMemoryTransport()
    expect(await run(healthy, new Date('2027-01-02T15:00:00Z'))).toEqual({
      ok: true,
      value: { sent: 1 },
    })
    expect(healthy.sent.map((m) => [m.to, m.subject])).toEqual([
      [adminEmail, 'Processing time: October to December 2026'],
    ])
    expect((await scheduleRow(id))?.nextRunOn).toBe('2027-04-01')
    await setSchedulePaused(handle.db, world.staff, { id, paused: true }, signal)
  })

  it('a report changed after a partial run goes to every recipient, not only those still owed', async () => {
    const id = await schedule({
      report: 'permit-volume',
      frequency: 'quarterly',
      recipientIds: [world.staff.userId, world.admin.userId],
      now: new Date('2027-02-15T15:00:00Z'),
    })
    const adminEmail = await emailOf(world.admin.userId)
    const partial = createMemoryTransport()
    const failing: MailTransport = {
      send: (message, s) =>
        message.to === adminEmail ? Promise.resolve(err('send_failed')) : partial.send(message, s),
    }
    const april = new Date('2027-04-01T15:00:00Z')
    expect((await run(failing, april)).ok).toBe(false)
    const edited = await updateSchedule(
      handle.db,
      world.staff,
      {
        id,
        report: 'revenue',
        frequency: 'quarterly',
        recipientIds: [world.staff.userId, world.admin.userId],
        now: april,
      },
      signal,
    )
    expect(edited.ok).toBe(true)
    const healthy = createMemoryTransport()
    await run(healthy, new Date('2027-04-01T16:00:00Z'))
    expect(healthy.sent.map((m) => m.subject)).toEqual([
      'Revenue: January to March 2027',
      'Revenue: January to March 2027',
    ])
    await setSchedulePaused(handle.db, world.staff, { id, paused: true }, signal)
  })

  it('a paused schedule sends nothing', async () => {
    const mail = createMemoryTransport()
    expect(await run(mail, new Date('2027-06-01T15:00:00Z'))).toEqual({
      ok: true,
      value: { sent: 0 },
    })
  })

  it('an incomplete census month says what is missing instead of attaching files', async () => {
    await makeApplication(handle.db, world, { state: 'issued', issuedOn: '2027-05-10' })
    await schedule({
      report: 'census',
      frequency: 'monthly',
      recipientIds: [world.staff.userId],
      now: new Date('2027-05-15T15:00:00Z'),
    })
    const mail = createMemoryTransport()
    expect(await run(mail, new Date('2027-06-01T15:00:00Z'))).toEqual({
      ok: true,
      value: { sent: 1 },
    })
    expect(mail.sent[0]?.attachments ?? []).toEqual([])
    expect(mail.sent[0]?.text).toContain('1 issued building permit needs classification')
    expect(mail.sent[0]?.text).toContain('/staff/reports/census?year=2027&month=5')
  })
})
