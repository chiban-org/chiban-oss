import { and, eq, isNotNull } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { env } from '@/config/env'
import { contractorClaims, notificationOutbox, projectParties, users } from '@/db/schema'
import { type Actor, loadActor } from '@/features/auth/actor'
import { claimProject } from '@/features/contractors/claims'
import { startCounterIntake } from '@/features/counter/intake/startIntake'
import { submitCounterIntake } from '@/features/counter/intake/submitIntake'
import { createMemoryTransport, type MemoryMailTransport } from '@/features/mail/memoryTransport'
import { queueForParties } from '@/features/notifications/queue'
import { sendQueuedNotifications } from '@/features/notifications/send'
import { saveDraftValues } from '@/features/portal/drafts'
import { type BoardWorld, setupBoardWorld } from '@/test/boardFixtures'
import { makeTestDb, type TestDb } from '@/test/db'
import { makeUser } from '@/test/factories'
import { err } from '@/types/result'

const signal = new AbortController().signal
const NOW = new Date('2028-01-03T16:00:00Z')
const WALK_IN = { name: 'Morgan Reyes', email: 'morgan.reyes@alderpond.example' }
const CLAIM_PREFIX = `${env.BASE_URL}/claim/`
let handle: TestDb
let world: BoardWorld
let mail: MemoryMailTransport

beforeEach(async () => {
  handle = await makeTestDb()
  world = await setupBoardWorld(handle.db)
  mail = createMemoryTransport()
})
afterEach(async () => {
  await handle.drop()
})

async function takenAndSubmitted(applicant: { name: string; email?: string } = WALK_IN) {
  const started = await startCounterIntake(
    handle.db,
    world.staff,
    { parcelId: world.parcelId, applicationTypeKey: world.zbaTypeKey, applicant, now: NOW },
    signal,
  )
  if (!started.ok) throw new Error('start failed')
  const { applicationId } = started.value
  await saveDraftValues(
    handle.db,
    world.staff,
    { applicationId, values: { classification: 'residential' } },
    signal,
  )
  const done = await submitCounterIntake(
    handle.db,
    world.staff,
    { applicationId, signedOnPaper: true, now: NOW },
    signal,
  )
  if (!done.ok) throw new Error('submit failed')
  return applicationId
}

const outbox = (applicationId: string) =>
  handle.db
    .select()
    .from(notificationOutbox)
    .where(eq(notificationOutbox.applicationId, applicationId))

const send = () => sendQueuedNotifications(handle.db, mail, signal, NOW)

function tokenIn(text: string): string {
  return new RegExp(`${CLAIM_PREFIX}([A-Za-z0-9_-]+)`).exec(text)?.[1] ?? ''
}

async function walkInAccount(): Promise<Actor> {
  const userId = await makeUser(handle.db, { role: 'applicant', email: WALK_IN.email })
  const actor = await loadActor(handle.db, userId, signal)
  if (actor === null) throw new Error('actor')
  return actor
}

async function queueIssued(applicationId: string) {
  await handle.db.transaction((tx) =>
    queueForParties(tx, { event: 'application_issued', applicationId }, signal),
  )
}

describe('emails to an applicant recorded at the counter without an account', () => {
  it('queues the received notice to the applicant party, not to any user', async () => {
    const applicationId = await takenAndSubmitted()
    const rows = await outbox(applicationId)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ event: 'application_submitted', recipientUserId: null })
    const [party] = await handle.db
      .select({ id: projectParties.id })
      .from(projectParties)
      .where(eq(projectParties.email, WALK_IN.email))
    expect(rows[0]?.recipientPartyId).toBe(party?.id)
    expect(rows.map((r) => r.recipientUserId)).not.toContain(world.staff.userId)
  })

  it('sends it to the recorded address with a claim link that opens the application', async () => {
    const applicationId = await takenAndSubmitted()
    expect(await send()).toBe(1)
    expect(mail.sent.map((m) => m.to)).toEqual([WALK_IN.email])
    const body = mail.sent[0]?.text ?? ''
    expect(body).toContain(CLAIM_PREFIX)
    expect(body).not.toContain('/portal/applications/')
    expect(mail.sent[0]?.html).toContain('Claim the application')
    const claimed = await claimProject(handle.db, await walkInAccount(), tokenIn(body), signal, NOW)
    expect(claimed.ok && claimed.value.applicationId).toBe(applicationId)
  })

  it('does not use up the claim links the clerk may send by hand', async () => {
    const applicationId = await takenAndSubmitted()
    for (let i = 0; i < 6; i += 1) {
      await handle.db.transaction((tx) =>
        queueForParties(
          tx,
          { event: 'application_issued', applicationId, discriminator: String(i) },
          signal,
        ),
      )
    }
    await send()
    const minted = await handle.db
      .select({ kind: contractorClaims.sentByKind })
      .from(contractorClaims)
    expect(minted.every((m) => m.kind === 'system')).toBe(true)
    expect(minted.length).toBeGreaterThan(5)
  })

  it('switches to the account once the applicant claims, without a second email', async () => {
    const applicationId = await takenAndSubmitted()
    await send()
    const account = await walkInAccount()
    await claimProject(handle.db, account, tokenIn(mail.sent[0]?.text ?? ''), signal, NOW)
    await queueIssued(applicationId)
    const issued = (await outbox(applicationId)).filter((r) => r.event === 'application_issued')
    expect(issued).toEqual([
      expect.objectContaining({ recipientUserId: account.userId, recipientPartyId: null }),
    ])
    await send()
    const last = mail.sent.at(-1)
    expect(mail.sent).toHaveLength(2)
    expect(last?.text).toContain(`/portal/applications/${applicationId}`)
    expect(last?.text).not.toContain(CLAIM_PREFIX)
  })

  it('delivers a row queued before the claim to the account once, with a portal link', async () => {
    const applicationId = await takenAndSubmitted()
    const account = await walkInAccount()
    await handle.db
      .update(projectParties)
      .set({ userId: account.userId })
      .where(eq(projectParties.email, WALK_IN.email))
    expect(await send()).toBe(1)
    expect(mail.sent[0]?.to).toBe(WALK_IN.email)
    expect(mail.sent[0]?.text).toContain(`/portal/applications/${applicationId}`)
    expect(mail.sent[0]?.text).not.toContain(CLAIM_PREFIX)
  })

  it('drops the party row when the account already has the same notice queued', async () => {
    const applicationId = await takenAndSubmitted()
    const account = await walkInAccount()
    await handle.db
      .update(projectParties)
      .set({ userId: account.userId })
      .where(eq(projectParties.email, WALK_IN.email))
    await handle.db.transaction((tx) =>
      queueForParties(tx, { event: 'application_submitted', applicationId }, signal),
    )
    expect(await send()).toBe(1)
    expect(mail.sent).toHaveLength(1)
    const dropped = await handle.db
      .select({ reason: notificationOutbox.dropReason })
      .from(notificationOutbox)
      .where(
        and(
          eq(notificationOutbox.applicationId, applicationId),
          isNotNull(notificationOutbox.recipientPartyId),
        ),
      )
    expect(dropped).toEqual([{ reason: 'claimed' }])
  })

  it('revokes the claim link of an email that failed to send', async () => {
    await takenAndSubmitted()
    const failing = {
      send: () => Promise.resolve(err('send_failed' as const)),
    }
    await sendQueuedNotifications(handle.db, failing, signal, NOW)
    const claims = await handle.db
      .select({ revokedAt: contractorClaims.revokedAt })
      .from(contractorClaims)
    expect(claims).toHaveLength(1)
    expect(claims[0]?.revokedAt).not.toBeNull()
  })

  it('queues nothing when the clerk recorded no email address', async () => {
    const applicationId = await takenAndSubmitted({ name: 'No Email Walk-in' })
    expect(await outbox(applicationId)).toEqual([])
  })

  it('never queues the clerk', async () => {
    const applicationId = await takenAndSubmitted()
    await queueIssued(applicationId)
    const rows = await outbox(applicationId)
    expect(rows.map((r) => r.recipientUserId)).not.toContain(world.staff.userId)
    const [clerk] = await handle.db
      .select({ email: users.email })
      .from(users)
      .where(eq(users.id, world.staff.userId))
    await send()
    expect(mail.sent.map((m) => m.to)).not.toContain(clerk?.email)
  })
})
