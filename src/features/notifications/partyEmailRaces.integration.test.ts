import { and, eq, isNull } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { env } from '@/config/env'
import { contractorClaims, notificationOutbox, projectParties } from '@/db/schema'
import { type Actor, loadActor } from '@/features/auth/actor'
import { claimProject } from '@/features/contractors/claims'
import { startCounterIntake } from '@/features/counter/intake/startIntake'
import type { MailMessage, MailTransport } from '@/features/mail/transport'
import { queueForParties } from '@/features/notifications/queue'
import { runJob } from '@/jobs/defineJob'
import { makeNotificationsSendJob } from '@/jobs/notificationsSend'
import { type BoardWorld, setupBoardWorld } from '@/test/boardFixtures'
import { makeTestDb, type TestDb } from '@/test/db'
import { makeUser } from '@/test/factories'
import { blockedOrSettled, holdOpen } from '@/test/lockWait'
import { ok } from '@/types/result'

const signal = new AbortController().signal
const NOW = new Date('2028-01-03T16:00:00Z')
const WALK_IN = { name: 'Morgan Reyes', email: 'morgan.reyes@alderpond.example' }
const CLAIM_PREFIX = `${env.BASE_URL}/claim/`
let handle: TestDb
let world: BoardWorld

beforeEach(async () => {
  handle = await makeTestDb()
  world = await setupBoardWorld(handle.db)
})
afterEach(async () => {
  await handle.drop()
})

async function taken(): Promise<string> {
  const started = await startCounterIntake(
    handle.db,
    world.staff,
    {
      parcelId: world.parcelId,
      applicationTypeKey: world.zbaTypeKey,
      applicant: WALK_IN,
      now: NOW,
    },
    signal,
  )
  if (!started.ok) throw new Error('start failed')
  return started.value.applicationId
}

async function walkInAccount(): Promise<Actor> {
  const userId = await makeUser(handle.db, { role: 'applicant', email: WALK_IN.email })
  const actor = await loadActor(handle.db, userId, signal)
  if (actor === null) throw new Error('actor')
  return actor
}

async function queue(applicationId: string, event: 'application_issued' | 'application_denied') {
  await handle.db.transaction((tx) => queueForParties(tx, { event, applicationId }, signal))
}

function abortAfterFirst(sent: MailMessage[]): MailTransport {
  return {
    send: (message) => {
      if (sent.length > 0) {
        const aborted = new Error('worker stopped')
        aborted.name = 'AbortError'
        return Promise.reject(aborted)
      }
      sent.push(message)
      return Promise.resolve(ok(undefined))
    },
  }
}

describe('claim links minted by the notification job', () => {
  it('keeps the emailed link working when the batch rolls back after sending', async () => {
    const applicationId = await taken()
    await queue(applicationId, 'application_issued')
    await queue(applicationId, 'application_denied')
    const sent: MailMessage[] = []
    const job = makeNotificationsSendJob({ mail: abortAfterFirst(sent) })
    await expect(runJob(handle.db, job, { at: NOW.toISOString() }, signal)).rejects.toThrow()
    expect(sent).toHaveLength(1)
    const live = await handle.db
      .select({ id: contractorClaims.id })
      .from(contractorClaims)
      .where(and(isNull(contractorClaims.claimedAt), isNull(contractorClaims.revokedAt)))
    expect(live).toHaveLength(1)
    const token = new RegExp(`${CLAIM_PREFIX}([A-Za-z0-9_-]+)`).exec(sent[0]?.text ?? '')?.[1]
    const claimed = await claimProject(handle.db, await walkInAccount(), token ?? '', signal)
    expect(claimed).toMatchObject({ ok: true })
  })
})

describe('resolving recipients while the applicant claims', () => {
  it('waits for a claim in flight and queues the account, not the address', async () => {
    const applicationId = await taken()
    const account = await walkInAccount()
    const claiming = await holdOpen(handle.db, (tx) =>
      tx
        .update(projectParties)
        .set({ userId: account.userId })
        .where(eq(projectParties.email, WALK_IN.email)),
    )
    const queueing = queue(applicationId, 'application_issued')
    expect(await blockedOrSettled(handle.db, queueing)).toBe('blocked')
    await claiming.commit()
    await queueing
    const rows = await handle.db
      .select({
        user: notificationOutbox.recipientUserId,
        party: notificationOutbox.recipientPartyId,
      })
      .from(notificationOutbox)
      .where(eq(notificationOutbox.applicationId, applicationId))
    expect(rows).toEqual([{ user: account.userId, party: null }])
  })
})
