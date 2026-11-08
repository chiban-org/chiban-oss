import { and, eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  applications,
  attestations,
  auditLog,
  counterIntakes,
  notificationOutbox,
  projectParties,
  roleCapabilities,
  users,
} from '@/db/schema'
import { listApplicationsForViewer } from '@/features/applications/listForViewer'
import { startCounterIntake } from '@/features/counter/intake/startIntake'
import { submitCounterIntake } from '@/features/counter/intake/submitIntake'
import { feeBalance } from '@/features/ledger/feeBalance'
import { saveDraftValues } from '@/features/portal/drafts'
import { type BoardWorld, setupBoardWorld } from '@/test/boardFixtures'
import { makeTestDb, type TestDb } from '@/test/db'

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

async function take(applicant: { name: string; email?: string } = WALK_IN) {
  const started = await startCounterIntake(
    handle.db,
    world.staff,
    { parcelId: world.parcelId, applicationTypeKey: world.zbaTypeKey, applicant, now: NOW },
    signal,
  )
  if (!started.ok) throw new Error(`start failed: ${JSON.stringify(started.error)}`)
  return started.value
}

async function fillAndSubmit(applicationId: string) {
  const saved = await saveDraftValues(
    handle.db,
    world.staff,
    { applicationId, values: { classification: 'residential' } },
    signal,
  )
  if (!saved.ok) throw new Error('save failed')
  return await submitCounterIntake(
    handle.db,
    world.staff,
    { applicationId, signedOnPaper: true, now: NOW },
    signal,
  )
}

async function applicantEmail(): Promise<string> {
  const [row] = await handle.db
    .select({ email: users.email })
    .from(users)
    .where(eq(users.id, world.applicant.userId))
  return row?.email ?? ''
}

async function applicantParty(applicationId: string) {
  const [row] = await handle.db
    .select({ party: projectParties })
    .from(counterIntakes)
    .innerJoin(projectParties, eq(projectParties.id, counterIntakes.applicantPartyId))
    .where(eq(counterIntakes.applicationId, applicationId))
  return row?.party
}

describe('taking an application at the counter', () => {
  it('records a walk-in without an account as the applicant party and the clerk as taker', async () => {
    const { applicationId } = await take()
    const party = await applicantParty(applicationId)
    expect(party).toMatchObject({ role: 'applicant', userId: null, ...WALK_IN })
    const [app] = await handle.db
      .select()
      .from(applications)
      .where(eq(applications.id, applicationId))
    expect(app).toMatchObject({ state: 'draft', createdBy: world.staff.userId })
    const [intake] = await handle.db
      .select()
      .from(counterIntakes)
      .where(eq(counterIntakes.applicationId, applicationId))
    expect(intake?.takenBy).toBe(world.staff.userId)
    const audits = await handle.db
      .select({ action: auditLog.action })
      .from(auditLog)
      .where(
        and(
          eq(auditLog.entityId, applicationId),
          eq(auditLog.action, 'application.counter_intake'),
        ),
      )
    expect(audits).toHaveLength(1)
  })

  it('gives the application to an applicant who already has an account', async () => {
    const { applicationId } = await take({
      name: '',
      email: (await applicantEmail()).toUpperCase(),
    })
    const party = await applicantParty(applicationId)
    expect(party?.userId).toBe(world.applicant.userId)
    await fillAndSubmit(applicationId)
    const page = await listApplicationsForViewer(
      handle.db,
      world.applicant,
      { limit: 50, scope: 'party' },
      signal,
    )
    expect(page.rows.map((r) => r.id)).toContain(applicationId)
  })

  it('needs a name when no account matches the email', async () => {
    const started = await startCounterIntake(
      handle.db,
      world.staff,
      {
        parcelId: world.parcelId,
        applicationTypeKey: world.zbaTypeKey,
        applicant: { name: ' ', email: 'nobody@alderpond.example' },
        now: NOW,
      },
      signal,
    )
    expect(started).toEqual({ ok: false, error: 'name_required' })
  })

  it('submits with the paper attestation recorded under the clerk, and assesses the intake fee', async () => {
    const { applicationId } = await take()
    const submitted = await fillAndSubmit(applicationId)
    expect(submitted.ok).toBe(true)
    const [app] = await handle.db
      .select({ state: applications.state })
      .from(applications)
      .where(eq(applications.id, applicationId))
    expect(app?.state).toBe('submitted')
    const [attested] = await handle.db
      .select()
      .from(attestations)
      .where(eq(attestations.applicationId, applicationId))
    expect(attested?.userId).toBe(world.staff.userId)
    expect(attested?.statementText).toContain('The applicant signed this statement on paper.')
    const [intake] = await handle.db
      .select()
      .from(counterIntakes)
      .where(eq(counterIntakes.applicationId, applicationId))
    expect(intake?.paperAttestationRecordedBy).toBe(world.staff.userId)
    expect(intake?.paperAttestationRecordedAt).not.toBeNull()
    expect((await feeBalance(handle.db, applicationId, signal)).dueCents).toBe(10000)
  })

  it('refuses to submit until the clerk confirms the paper attestation', async () => {
    const { applicationId } = await take()
    const refused = await submitCounterIntake(
      handle.db,
      world.staff,
      { applicationId, signedOnPaper: false, now: NOW },
      signal,
    )
    expect(refused).toEqual({ ok: false, error: 'paper_attestation_required' })
    const [app] = await handle.db
      .select({ state: applications.state })
      .from(applications)
      .where(eq(applications.id, applicationId))
    expect(app?.state).toBe('draft')
  })

  it('reports missing answers instead of submitting', async () => {
    const { applicationId } = await take()
    const refused = await submitCounterIntake(
      handle.db,
      world.staff,
      { applicationId, signedOnPaper: true, now: NOW },
      signal,
    )
    expect(refused.ok).toBe(false)
    if (refused.ok || typeof refused.error !== 'object' || !('fieldErrors' in refused.error))
      throw new Error('expected field errors')
    expect(refused.error.fieldErrors.map((f) => f.field)).toContain('classification')
  })
})

describe('notices for an application taken at the counter', () => {
  async function outbox(applicationId: string) {
    return await handle.db
      .select({ to: notificationOutbox.recipientUserId, event: notificationOutbox.event })
      .from(notificationOutbox)
      .where(eq(notificationOutbox.applicationId, applicationId))
  }

  it('never sends the clerk the applicant notices', async () => {
    const { applicationId } = await take()
    await fillAndSubmit(applicationId)
    const rows = await outbox(applicationId)
    expect(rows.map((r) => r.to)).not.toContain(world.staff.userId)
    expect(rows).toEqual([])
  })

  it('sends the submitted notice to an applicant who has an account', async () => {
    const { applicationId } = await take({ name: '', email: await applicantEmail() })
    await fillAndSubmit(applicationId)
    expect(await outbox(applicationId)).toEqual([
      { to: world.applicant.userId, event: 'application_submitted' },
    ])
  })
})

describe('who may take an application at the counter', () => {
  async function staffWithout(capability: string) {
    await handle.db
      .delete(roleCapabilities)
      .where(and(eq(roleCapabilities.role, 'staff'), eq(roleCapabilities.capability, capability)))
    return world.staff
  }

  it('refuses a user without the counter capabilities', async () => {
    const started = await startCounterIntake(
      handle.db,
      world.reviewer,
      {
        parcelId: world.parcelId,
        applicationTypeKey: world.zbaTypeKey,
        applicant: WALK_IN,
        now: NOW,
      },
      signal,
    )
    expect(started).toEqual({ ok: false, error: 'forbidden' })
  })

  it('refuses a counter user who may not manage project parties', async () => {
    const clerk = await staffWithout('project.manage_parties')
    const started = await startCounterIntake(
      handle.db,
      clerk,
      {
        parcelId: world.parcelId,
        applicationTypeKey: world.zbaTypeKey,
        applicant: WALK_IN,
        now: NOW,
      },
      signal,
    )
    expect(started).toEqual({ ok: false, error: 'forbidden' })
  })

  it('refuses to submit for a user without the counter capabilities', async () => {
    const { applicationId } = await take()
    const refused = await submitCounterIntake(
      handle.db,
      world.reviewer,
      { applicationId, signedOnPaper: true, now: NOW },
      signal,
    )
    expect(refused).toEqual({ ok: false, error: 'forbidden' })
  })
})
