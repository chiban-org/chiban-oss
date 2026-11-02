import { eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { env } from '@/config/env'
import { notificationOutbox, projectParties, users } from '@/db/schema'
import { attestationHash, submitApplication } from '@/features/applications/submitApplication'
import { transitionApplication } from '@/features/applications/transition'
import { createMemoryTransport, type MemoryMailTransport } from '@/features/mail/memoryTransport'
import type { MailMessage, MailTransport } from '@/features/mail/transport'
import { queueNotification } from '@/features/notifications/queue'
import { sendQueuedNotifications } from '@/features/notifications/send'
import { addParty, removeParty } from '@/features/projects/parties'
import { assignReviewer, removeReviewer } from '@/features/reviews/assignments'
import { runJob } from '@/jobs/defineJob'
import { makeNotificationsSendJob } from '@/jobs/notificationsSend'
import { makeApplication, type PermitWorld, setupPermitWorld } from '@/test/applicationFixtures'
import { appTypeBody } from '@/test/configFixtures'
import { makeTestDb, type TestDb } from '@/test/db'
import { err } from '@/types/result'

const signal = new AbortController().signal
const HASH = attestationHash(appTypeBody().attestationText)
let handle: TestDb
let world: PermitWorld
let mail: MemoryMailTransport

beforeEach(async () => {
  handle = await makeTestDb()
  world = await setupPermitWorld(handle.db)
  mail = createMemoryTransport()
})
afterEach(async () => {
  await handle.drop()
})

const outbox = () => handle.db.select().from(notificationOutbox)
const send = (transport: MailTransport = mail, now = new Date()) =>
  sendQueuedNotifications(handle.db, transport, signal, now)

async function queue(
  event: 'application_issued' | 'application_submitted',
  applicationId: string,
  userIds: string[],
) {
  await handle.db.transaction((tx) =>
    queueNotification(tx, { event, applicationId, recipientUserIds: userIds }, signal),
  )
}

async function emailOf(userId: string): Promise<string> {
  const [row] = await handle.db
    .select({ email: users.email })
    .from(users)
    .where(eq(users.id, userId))
  return row?.email ?? ''
}

describe('notification outbox', () => {
  it('submit queues application_submitted for the applicant', async () => {
    const app = await makeApplication(handle.db, world)
    const done = await submitApplication(
      handle.db,
      world.applicant,
      {
        applicationId: app.applicationId,
        values: { classification: 'residential' },
        attestation: { statementSha256: HASH },
      },
      signal,
    )
    expect(done.ok).toBe(true)
    const rows = await outbox()
    expect(rows).toMatchObject([
      { event: 'application_submitted', recipientUserId: world.applicant.userId, status: 'queued' },
    ])
    await send()
    expect(mail.sent.map((m) => m.subject)).toEqual([`Application ${app.number} received`])
    expect((await outbox())[0]?.status).toBe('sent')
  })

  it('denial queues application_denied and issuance queues application_issued for parties', async () => {
    const app = await makeApplication(handle.db, world, { state: 'under_review' })
    const moved = await handle.db.transaction((tx) =>
      transitionApplication(
        tx,
        world.staff,
        { applicationId: app.applicationId, to: 'denied', expectedRowVersion: 1 },
        signal,
      ),
    )
    expect(moved.ok).toBe(true)
    expect((await outbox()).map((r) => r.event)).toEqual(['application_denied'])
  })

  it('queuing the same event and recipient twice inserts once', async () => {
    const app = await makeApplication(handle.db, world)
    await queue('application_issued', app.applicationId, [world.applicant.userId])
    await queue('application_issued', app.applicationId, [world.applicant.userId])
    expect(await outbox()).toHaveLength(1)
  })

  it('notification to a removed party is dropped', async () => {
    const app = await makeApplication(handle.db, world)
    await queue('application_issued', app.applicationId, [world.applicant.userId])
    const [party] = await handle.db
      .select()
      .from(projectParties)
      .where(eq(projectParties.userId, world.applicant.userId))
    await removeParty(handle.db, world.staff, party?.id ?? '', signal)
    await send()
    expect(mail.sent).toEqual([])
    expect((await outbox())[0]).toMatchObject({ status: 'dropped', dropReason: 'no_access' })
  })

  it('a reviewer unassigned before send is dropped', async () => {
    const app = await makeApplication(handle.db, world)
    const assigned = await assignReviewer(
      handle.db,
      world.staff,
      { applicationId: app.applicationId, reviewerUserId: world.reviewer.userId },
      signal,
    )
    if (!assigned.ok) throw new Error('assign')
    expect((await outbox()).map((r) => r.event)).toEqual(['review_assigned'])
    await removeReviewer(
      handle.db,
      world.staff,
      { assignmentId: assigned.value.assignmentId },
      signal,
    )
    await send()
    expect(mail.sent).toEqual([])
    expect((await outbox())[0]?.dropReason).toBe('no_access')
  })

  it('an assigned reviewer is told, with a staff link', async () => {
    const app = await makeApplication(handle.db, world)
    await assignReviewer(
      handle.db,
      world.staff,
      { applicationId: app.applicationId, reviewerUserId: world.reviewer.userId },
      signal,
    )
    await send()
    expect(mail.sent[0]?.subject).toBe(`Review requested: ${app.number}`)
    expect(mail.sent[0]?.text).toContain(`${env.BASE_URL}/staff/`)
  })

  it('a deactivated recipient is dropped', async () => {
    const app = await makeApplication(handle.db, world)
    await queue('application_issued', app.applicationId, [world.applicant.userId])
    await handle.db
      .update(users)
      .set({ isActive: false })
      .where(eq(users.id, world.applicant.userId))
    await send()
    expect((await outbox())[0]).toMatchObject({ status: 'dropped', dropReason: 'inactive_user' })
    expect(mail.sent).toEqual([])
  })

  it('a send failure is retried and marked failed after 5 attempts', async () => {
    const app = await makeApplication(handle.db, world)
    await queue('application_issued', app.applicationId, [world.applicant.userId])
    const failing: MailTransport = { send: () => Promise.resolve(err('send_failed' as const)) }
    for (let i = 1; i <= 4; i += 1) {
      await send(failing)
      expect((await outbox())[0]).toMatchObject({ status: 'queued', attempts: i })
    }
    await send(failing)
    expect((await outbox())[0]).toMatchObject({ status: 'failed', attempts: 5 })
    await send(mail)
    expect(mail.sent).toEqual([])
  })

  it("issued email contains the portal link and no other party's email", async () => {
    const app = await makeApplication(handle.db, world)
    await addParty(
      handle.db,
      world.staff,
      {
        projectId: world.projectId,
        role: 'contractor',
        name: 'Pat Builder',
        email: 'pat.builder@alderpond.example',
      },
      signal,
    )
    await queue('application_issued', app.applicationId, [world.applicant.userId])
    await send()
    const message = mail.sent[0] as MailMessage
    expect(message.to).toBe(await emailOf(world.applicant.userId))
    expect(message.text).toContain(`${env.BASE_URL}/portal/applications/${app.applicationId}`)
    expect(message.html).toContain(`/portal/applications/${app.applicationId}`)
    expect(message.text + message.html).not.toContain('pat.builder@alderpond.example')
    expect(message.text + message.html).not.toContain('Pat Builder')
  })

  it('job twice in one minute has one effect', async () => {
    const app = await makeApplication(handle.db, world)
    await queue('application_issued', app.applicationId, [world.applicant.userId])
    const job = makeNotificationsSendJob({ mail })
    const at = '2027-03-02T15:00:10.000Z'
    await runJob(handle.db, job, { at }, signal)
    await queue('application_submitted', app.applicationId, [world.applicant.userId])
    await runJob(handle.db, job, { at: '2027-03-02T15:00:50.000Z' }, signal)
    expect(mail.sent).toHaveLength(1)
  })
})
