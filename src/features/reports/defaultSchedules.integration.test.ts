import { eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { auditLog, reportScheduleRecipients, reportSchedules } from '@/db/schema'
import { loadActor } from '@/features/auth/actor'
import { createStaffUserWithDefaults } from '@/features/auth/createStaffUserWithDefaults'
import { createSchedule, deleteSchedule } from '@/features/reports/schedules'
import { makeTestDb, type TestDb } from '@/test/db'

const signal = new AbortController().signal
const NOV_9 = new Date('2026-11-09T15:00:00Z')
let handle: TestDb

beforeEach(async () => {
  handle = await makeTestDb()
})
afterEach(async () => {
  await handle.drop()
})

const person = (role: 'admin' | 'staff', email: string) => ({
  email,
  displayName: email,
  role,
  password: 'long-enough-password',
})

async function schedules() {
  const rows = await handle.db.select().from(reportSchedules)
  return rows.sort((a, b) => a.report.localeCompare(b.report))
}

describe('default report schedules on install', () => {
  it('creates monthly permit volume, processing time and revenue for the first admin only', async () => {
    const made = await createStaffUserWithDefaults(
      handle.db,
      person('admin', 'first@alderpond.example'),
      NOV_9,
      signal,
    )
    if (!made.ok) throw new Error(made.error)
    const rows = await schedules()
    expect(rows.map((r) => [r.report, r.frequency, r.paused, r.nextRunOn])).toEqual([
      ['permit-volume', 'monthly', false, '2026-12-01'],
      ['processing-time', 'monthly', false, '2026-12-01'],
      ['revenue', 'monthly', false, '2026-12-01'],
    ])
    for (const row of rows) {
      expect(row.createdBy).toBe(made.value.userId)
      const recipients = await handle.db
        .select()
        .from(reportScheduleRecipients)
        .where(eq(reportScheduleRecipients.scheduleId, row.id))
      expect(recipients.map((r) => r.userId)).toEqual([made.value.userId])
    }
    const audits = await handle.db
      .select()
      .from(auditLog)
      .where(eq(auditLog.entityType, 'report_schedule'))
    expect(audits).toHaveLength(3)
  })

  it('does nothing for a staff user, and nothing again for a second admin', async () => {
    await createStaffUserWithDefaults(
      handle.db,
      person('staff', 'clerk@alderpond.example'),
      NOV_9,
      signal,
    )
    expect(await schedules()).toHaveLength(0)
    await createStaffUserWithDefaults(
      handle.db,
      person('admin', 'first@alderpond.example'),
      NOV_9,
      signal,
    )
    await createStaffUserWithDefaults(
      handle.db,
      person('admin', 'second@alderpond.example'),
      NOV_9,
      signal,
    )
    expect(await schedules()).toHaveLength(3)
  })

  it('does not bring schedules back once the town deleted them', async () => {
    const first = await createStaffUserWithDefaults(
      handle.db,
      person('admin', 'first@alderpond.example'),
      NOV_9,
      signal,
    )
    if (!first.ok) throw new Error(first.error)
    const actor = await loadActor(handle.db, first.value.userId, signal)
    if (actor === null) throw new Error('no actor')
    for (const row of await schedules()) {
      await deleteSchedule(handle.db, actor, { id: row.id }, signal)
    }
    await createStaffUserWithDefaults(
      handle.db,
      person('admin', 'second@alderpond.example'),
      NOV_9,
      signal,
    )
    expect(await schedules()).toHaveLength(0)
  })

  it('leaves schedules a town already made alone', async () => {
    const first = await createStaffUserWithDefaults(
      handle.db,
      person('staff', 'clerk@alderpond.example'),
      NOV_9,
      signal,
    )
    if (!first.ok) throw new Error(first.error)
    const actor = await loadActor(handle.db, first.value.userId, signal)
    if (actor === null) throw new Error('no actor')
    await createSchedule(
      handle.db,
      actor,
      { report: 'permit-volume', frequency: 'weekly', recipientIds: [actor.userId], now: NOV_9 },
      signal,
    )
    await createStaffUserWithDefaults(
      handle.db,
      person('admin', 'first@alderpond.example'),
      NOV_9,
      signal,
    )
    expect(await schedules()).toHaveLength(1)
  })

  it('reports an existing email without creating schedules', async () => {
    await createStaffUserWithDefaults(
      handle.db,
      person('staff', 'a@alderpond.example'),
      NOV_9,
      signal,
    )
    const again = await createStaffUserWithDefaults(
      handle.db,
      person('staff', 'a@alderpond.example'),
      NOV_9,
      signal,
    )
    expect(again).toEqual({ ok: false, error: 'email_taken' })
  })
})
