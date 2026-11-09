import { and, eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { applications, clocks, notificationOutbox, users } from '@/db/schema'
import { startClocksFor } from '@/features/clocks/startClocks'
import { createMemoryTransport } from '@/features/mail/memoryTransport'
import { sendQueuedNotifications } from '@/features/notifications/send'
import { clocksDailyJob } from '@/jobs/clocksDaily'
import { runJob } from '@/jobs/defineJob'
import { makeApplication, type PermitWorld, setupPermitWorld } from '@/test/applicationFixtures'
import { makeTestDb, type TestDb } from '@/test/db'
import type { CivilDate } from '@/types/civilDate'

const signal = new AbortController().signal
const d = (s: string) => s as CivilDate
const RULE = 'nh.bp.decision'
let handle: TestDb
let world: PermitWorld

beforeEach(async () => {
  handle = await makeTestDb()
  world = await setupPermitWorld(handle.db)
})
afterEach(async () => {
  await handle.drop()
})

const run = (today: string) => runJob(handle.db, clocksDailyJob, { today: d(today) }, signal)

async function reviewedApp(responsibleUserId: string | null = null) {
  const app = await makeApplication(handle.db, world, {
    state: 'under_review',
    responsibleUserId,
    facts: { classification: 'residential', dwellingUnits: 1, afterTheFact: false },
  })
  await handle.db.transaction((tx) =>
    startClocksFor(tx, app.applicationId, 'application_completed', d('2027-03-01'), signal),
  )
  return app
}

async function notices(event: 'clock_due_soon' | 'clock_overdue') {
  return await handle.db
    .select()
    .from(notificationOutbox)
    .where(eq(notificationOutbox.event, event))
}

async function decisionClock(applicationId: string) {
  const [clock] = await handle.db
    .select()
    .from(clocks)
    .where(and(eq(clocks.applicationId, applicationId), eq(clocks.ruleKey, RULE)))
  return clock
}

describe('clock deadline notices', () => {
  it('warns the responsible staff member once when the deadline is five days out', async () => {
    const app = await reviewedApp(world.staff.userId)
    expect((await decisionClock(app.applicationId))?.currentDue).toBe('2027-03-31')
    await run('2027-03-25')
    expect(await notices('clock_due_soon')).toEqual([])
    await run('2027-03-26')
    await run('2027-03-27')
    const rows = await notices('clock_due_soon')
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      recipientUserId: world.staff.userId,
      applicationId: app.applicationId,
      payload: { dueOn: '2027-03-31', clockLabel: expect.any(String) },
    })
  })

  it('warns the staff who manage applications when nobody is assigned', async () => {
    await reviewedApp()
    await run('2027-03-26')
    const recipients = (await notices('clock_due_soon')).map((r) => r.recipientUserId)
    expect(recipients.sort()).toEqual([world.admin.userId, world.staff.userId].sort())
  })

  it('does not warn again after the application is reassigned', async () => {
    const app = await reviewedApp(world.staff.userId)
    await run('2027-03-26')
    await handle.db
      .update(applications)
      .set({ responsibleUserId: world.admin.userId })
      .where(eq(applications.id, app.applicationId))
    await run('2027-03-28')
    expect(await notices('clock_due_soon')).toHaveLength(1)
  })

  it('tells staff once when the deadline passes', async () => {
    await reviewedApp(world.staff.userId)
    await run('2027-04-01')
    await run('2027-04-02')
    const rows = await notices('clock_overdue')
    expect(rows).toHaveLength(1)
    expect(rows[0]?.payload).toMatchObject({ dueOn: '2027-03-31' })
  })

  it('warns again for the new date after the deadline is extended', async () => {
    const app = await reviewedApp(world.staff.userId)
    await run('2027-03-26')
    await handle.db
      .update(clocks)
      .set({ currentDue: '2027-04-20' })
      .where(eq(clocks.id, (await decisionClock(app.applicationId))?.id ?? ''))
    await run('2027-03-27')
    expect(await notices('clock_due_soon')).toHaveLength(1)
    await run('2027-04-15')
    expect((await notices('clock_due_soon')).map((r) => r.payload)).toMatchObject([
      { dueOn: '2027-03-31' },
      { dueOn: '2027-04-20' },
    ])
  })

  it('still warns on a denied application whose decision must yet be filed', async () => {
    const denied = await reviewedApp(world.staff.userId)
    await handle.db
      .update(applications)
      .set({ state: 'denied' })
      .where(eq(applications.id, denied.applicationId))
    await run('2027-03-26')
    expect(await notices('clock_due_soon')).toHaveLength(1)
  })

  it('warns the managers when the responsible account is disabled', async () => {
    await reviewedApp(world.reviewer.userId)
    await handle.db
      .update(users)
      .set({ isActive: false })
      .where(eq(users.id, world.reviewer.userId))
    await run('2027-03-26')
    const recipients = (await notices('clock_due_soon')).map((r) => r.recipientUserId)
    expect(recipients.sort()).toEqual([world.admin.userId, world.staff.userId].sort())
  })

  it('skips paused and met clocks and closed applications', async () => {
    const paused = await reviewedApp(world.staff.userId)
    const met = await reviewedApp(world.staff.userId)
    const withdrawn = await reviewedApp(world.staff.userId)
    await handle.db
      .update(clocks)
      .set({ status: 'stopped' })
      .where(eq(clocks.applicationId, paused.applicationId))
    await handle.db
      .update(clocks)
      .set({ status: 'met', metOn: '2027-03-20' })
      .where(eq(clocks.applicationId, met.applicationId))
    await handle.db
      .update(applications)
      .set({ state: 'withdrawn' })
      .where(eq(applications.id, withdrawn.applicationId))
    await run('2027-03-26')
    await run('2027-04-01')
    expect(await notices('clock_due_soon')).toEqual([])
    expect(await notices('clock_overdue')).toEqual([])
  })

  it('mails the warning to town staff, never to a responsible user outside the town staff', async () => {
    const app = await reviewedApp(world.reviewer.userId)
    await run('2027-03-26')
    const mail = createMemoryTransport()
    await sendQueuedNotifications(handle.db, mail, signal)
    const recipients = (await notices('clock_due_soon')).map((r) => r.recipientUserId)
    expect(recipients).not.toContain(world.reviewer.userId)
    expect(mail.sent).toHaveLength(2)
    await handle.db
      .update(applications)
      .set({ responsibleUserId: world.staff.userId })
      .where(eq(applications.id, app.applicationId))
    await run('2027-04-01')
    await sendQueuedNotifications(handle.db, mail, signal)
    expect(mail.sent).toHaveLength(3)
    expect(mail.sent[2]?.subject).toContain('Deadline passed')
    expect(mail.sent[2]?.text).toContain(`/staff/applications/${app.applicationId}`)
    expect(mail.sent[2]?.text).toContain('March 31, 2027')
  })
})
