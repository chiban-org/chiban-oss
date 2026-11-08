import { eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { applications, projectParties, users } from '@/db/schema'
import { listApplicationsForViewer } from '@/features/applications/listForViewer'
import { loadActor } from '@/features/auth/actor'
import { claimProject } from '@/features/contractors/claims'
import { sendCounterClaim } from '@/features/contractors/counterClaim'
import { startCounterIntake } from '@/features/counter/intake/startIntake'
import { submitCounterIntake } from '@/features/counter/intake/submitIntake'
import { discardCounterIntake, listUnfinishedIntakes } from '@/features/counter/intake/unfinished'
import { createMemoryTransport } from '@/features/mail/memoryTransport'
import { saveDraftValues } from '@/features/portal/drafts'
import { type BoardWorld, setupBoardWorld } from '@/test/boardFixtures'
import { makeTestDb, type TestDb } from '@/test/db'
import { makeUser } from '@/test/factories'

const signal = new AbortController().signal
const NOW = new Date('2028-01-03T16:00:00Z')
const WALK_IN = { name: 'Morgan Reyes', email: 'morgan.reyes@alderpond.example' }
let handle: TestDb
let world: BoardWorld

beforeEach(async () => {
  handle = await makeTestDb()
  world = await setupBoardWorld(handle.db)
})
afterEach(async () => {
  await handle.drop()
})

async function take(applicant: { name: string; email?: string } = WALK_IN): Promise<string> {
  const started = await startCounterIntake(
    handle.db,
    world.staff,
    { parcelId: world.parcelId, applicationTypeKey: world.zbaTypeKey, applicant, now: NOW },
    signal,
  )
  if (!started.ok) throw new Error(`start failed: ${JSON.stringify(started.error)}`)
  return started.value.applicationId
}

async function submit(applicationId: string): Promise<void> {
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
  if (!done.ok) throw new Error(`submit failed: ${JSON.stringify(done.error)}`)
}

async function clerkName(): Promise<string> {
  const [row] = await handle.db
    .select({ name: users.displayName })
    .from(users)
    .where(eq(users.id, world.staff.userId))
  return row?.name ?? ''
}

describe('unfinished counter applications', () => {
  it('lists a draft with its type, parcel, applicant and the clerk who started it', async () => {
    const applicationId = await take()
    const rows = await listUnfinishedIntakes(handle.db, signal)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      applicationId,
      typeLabel: world.zbaTypeKey,
      applicantName: WALK_IN.name,
      takenByName: await clerkName(),
    })
    expect(rows[0]?.parcelLabel).not.toBe('')
  })

  it('drops an application from the list once it is submitted', async () => {
    const applicationId = await take()
    await submit(applicationId)
    expect(await listUnfinishedIntakes(handle.db, signal)).toEqual([])
  })

  it('discards a draft by withdrawing it', async () => {
    const applicationId = await take()
    const discarded = await discardCounterIntake(handle.db, world.staff, { applicationId }, signal)
    expect(discarded.ok).toBe(true)
    const [app] = await handle.db
      .select({ state: applications.state })
      .from(applications)
      .where(eq(applications.id, applicationId))
    expect(app?.state).toBe('withdrawn')
    expect(await listUnfinishedIntakes(handle.db, signal)).toEqual([])
  })

  it('refuses to discard for a user without the counter capabilities', async () => {
    const applicationId = await take()
    const refused = await discardCounterIntake(handle.db, world.reviewer, { applicationId }, signal)
    expect(refused).toEqual({ ok: false, error: 'forbidden' })
  })

  it('refuses to discard an application that was already submitted', async () => {
    const applicationId = await take()
    await submit(applicationId)
    const refused = await discardCounterIntake(handle.db, world.staff, { applicationId }, signal)
    expect(refused).toEqual({ ok: false, error: 'not_unfinished' })
  })
})

describe('claim link for an applicant taken at the counter', () => {
  it('lets the applicant claim the application and see it in their portal', async () => {
    const applicationId = await take()
    await submit(applicationId)
    const mail = createMemoryTransport()
    const sent = await sendCounterClaim(
      handle.db,
      mail,
      world.staff,
      { applicationId, role: 'applicant' },
      signal,
    )
    expect(sent.ok).toBe(true)
    expect(mail.sent[0]?.to).toBe(WALK_IN.email)
    expect(mail.sent[0]?.text).toContain('named as the applicant on an application')
    const token = /\/claim\/([A-Za-z0-9_-]+)/.exec(mail.sent[0]?.text ?? '')?.[1] ?? ''
    const userId = await makeUser(handle.db, { role: 'applicant', email: WALK_IN.email })
    const applicant = await loadActor(handle.db, userId, signal)
    if (applicant === null) throw new Error('actor')
    const claimed = await claimProject(handle.db, applicant, token, signal)
    expect(claimed.ok && claimed.value.role).toBe('applicant')
    expect(claimed.ok && claimed.value.applicationId).toBe(applicationId)
    const [party] = await handle.db
      .select({ userId: projectParties.userId })
      .from(projectParties)
      .where(eq(projectParties.email, WALK_IN.email))
    expect(party?.userId).toBe(userId)
    const page = await listApplicationsForViewer(
      handle.db,
      applicant,
      { limit: 50, scope: 'party' },
      signal,
    )
    expect(page.rows.map((r) => r.id)).toEqual([applicationId])
  })

  it('has nothing to send when the applicant gave no email', async () => {
    const applicationId = await take({ name: 'No Email Walk-in' })
    const sent = await sendCounterClaim(
      handle.db,
      createMemoryTransport(),
      world.staff,
      { applicationId, role: 'applicant' },
      signal,
    )
    expect(sent).toEqual({ ok: false, error: 'no_party_email' })
  })
})
