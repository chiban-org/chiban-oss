import { eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { env } from '@/config/env'
import { contractorClaims, notificationOutbox, projectParties } from '@/db/schema'
import { type Actor, loadActor } from '@/features/auth/actor'
import { claimProject, sendContractorClaim } from '@/features/contractors/claims'
import { sendCounterClaim } from '@/features/contractors/counterClaim'
import { saveContractorProfile } from '@/features/contractors/profile'
import { quickIssue } from '@/features/counter/quickIssue'
import { createMemoryTransport, type MemoryMailTransport } from '@/features/mail/memoryTransport'
import { INSPECTION_PARTY_ROLES, queueForParties } from '@/features/notifications/queue'
import { sendQueuedNotifications } from '@/features/notifications/send'
import type { PermitWorld } from '@/test/applicationFixtures'
import { makeTestDb, type TestDb } from '@/test/db'
import { makeUser } from '@/test/factories'
import { setupTradeWorld } from '@/test/ledgerFixtures'

const signal = new AbortController().signal
const NOW = new Date('2027-03-02T17:00:00Z')
const CONTRACTOR = { name: 'Pat Contractor', email: 'pat@contractor.example' }
const CLAIM_PREFIX = `${env.BASE_URL}/claim/`
let handle: TestDb
let world: PermitWorld
let mail: MemoryMailTransport

beforeEach(async () => {
  handle = await makeTestDb()
  world = (await setupTradeWorld(handle.db)).world
  mail = createMemoryTransport()
})
afterEach(async () => {
  await handle.drop()
})

const PROFILE = {
  name: CONTRACTOR.name,
  phone: '603-555-0142',
  mailingAddress: null,
  companyName: 'Pat Electric',
  trades: ['electrical' as const],
  licenses: [{ trade: 'electrical' as const, number: 'EL-20418' }],
}

async function issuedAtCounter(): Promise<string> {
  const issued = await quickIssue(
    handle.db,
    world.staff,
    {
      parcelId: world.parcelId,
      applicationTypeKey: 'EL',
      values: { description: 'Panel upgrade', service_amps: 200 },
      contractor: CONTRACTOR,
      license: { number: 'EL-20418', type: 'Master electrician', result: 'active' },
      payerName: CONTRACTOR.name,
      payment: { method: 'cash', tenderedCents: 5000 },
    },
    signal,
    { now: NOW },
  )
  if (!issued.ok) throw new Error('issue failed')
  return issued.value.applicationId
}

async function contractorAccount(): Promise<Actor> {
  const id = await makeUser(handle.db, { role: 'applicant', email: CONTRACTOR.email })
  const actor = (await loadActor(handle.db, id, signal)) as Actor
  const saved = await saveContractorProfile(handle.db, actor, PROFILE, signal)
  if (!saved.ok) throw new Error('profile')
  return actor
}

async function queueInspection(applicationId: string) {
  await handle.db.transaction((tx) =>
    queueForParties(
      tx,
      { event: 'inspection_scheduled', applicationId, roles: INSPECTION_PARTY_ROLES },
      signal,
    ),
  )
  return await handle.db
    .select({
      user: notificationOutbox.recipientUserId,
      party: notificationOutbox.recipientPartyId,
    })
    .from(notificationOutbox)
    .where(eq(notificationOutbox.applicationId, applicationId))
}

describe('notices to a contractor linked by email', () => {
  it('queues to the account, not the party, once the contractor has signed up', async () => {
    const applicationId = await issuedAtCounter()
    const actor = await contractorAccount()
    expect(await queueInspection(applicationId)).toEqual([{ user: actor.userId, party: null }])
    expect(await sendQueuedNotifications(handle.db, mail, signal, NOW)).toBe(1)
    expect(mail.sent.map((m) => m.to)).toEqual([CONTRACTOR.email])
    expect(mail.sent[0]?.text).not.toContain(CLAIM_PREFIX)
  })

  it('sends a notice queued to the party before sign-up once, to the account, with no claim link', async () => {
    const applicationId = await issuedAtCounter()
    const queued = await queueInspection(applicationId)
    expect(queued).toHaveLength(1)
    expect(queued[0]?.party).not.toBeNull()
    await contractorAccount()
    await sendQueuedNotifications(handle.db, mail, signal, NOW)
    expect(mail.sent.map((m) => m.to)).toEqual([CONTRACTOR.email])
    expect(mail.sent[0]?.text).not.toContain(CLAIM_PREFIX)
  })
})

describe('claim links after an email link', () => {
  it('a claim link sent before sign-up still opens the project after the auto link', async () => {
    await sendContractorClaim(
      handle.db,
      mail,
      world.staff,
      { projectId: world.projectId, email: CONTRACTOR.email, name: CONTRACTOR.name },
      signal,
    )
    const token = /\/claim\/([A-Za-z0-9_-]+)/.exec(mail.sent[0]?.text ?? '')?.[1]
    const actor = await contractorAccount()
    expect(await claimProject(handle.db, actor, token ?? '', signal)).toEqual({
      ok: true,
      value: { projectId: world.projectId, role: 'contractor', applicationId: null },
    })
    const parties = await handle.db
      .select({ userId: projectParties.userId })
      .from(projectParties)
      .where(eq(projectParties.email, CONTRACTOR.email))
    expect(parties).toEqual([{ userId: actor.userId }])
  })

  it('sends no claim email to a contractor whose new party links to their account at once', async () => {
    const actor = await contractorAccount()
    const sent = await sendContractorClaim(
      handle.db,
      mail,
      world.staff,
      { projectId: world.projectId, email: CONTRACTOR.email, name: CONTRACTOR.name },
      signal,
    )
    expect(sent).toEqual({ ok: false, error: 'already_linked' })
    expect(mail.sent).toEqual([])
    expect(await handle.db.select().from(contractorClaims)).toEqual([])
    const parties = await handle.db
      .select({ userId: projectParties.userId })
      .from(projectParties)
      .where(eq(projectParties.email, CONTRACTOR.email))
    expect(parties).toEqual([{ userId: actor.userId }])
  })

  it('the counter says the contractor already follows the permit instead of no email', async () => {
    await contractorAccount()
    const applicationId = await issuedAtCounter()
    expect(await sendCounterClaim(handle.db, mail, world.staff, { applicationId }, signal)).toEqual(
      { ok: false, error: 'already_linked' },
    )
    expect(mail.sent).toEqual([])
  })
})
