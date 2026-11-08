import { and, eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { auditLog, projectParties, userRoles, users } from '@/db/schema'
import { canViewApplication } from '@/features/access/queries'
import { loadViewParties } from '@/features/applications/viewParties'
import { type Actor, loadActor } from '@/features/auth/actor'
import { listContractorProjects } from '@/features/contractors/dashboard'
import { saveContractorProfile } from '@/features/contractors/profile'
import { addParty, removeParty } from '@/features/projects/parties'
import { createProject } from '@/features/projects/projects'
import { makeApplication, type PermitWorld, setupPermitWorld } from '@/test/applicationFixtures'
import { makeTestDb, type TestDb } from '@/test/db'
import { makeUser } from '@/test/factories'

const signal = new AbortController().signal
const EMAIL = 'pat@builder.example'
let handle: TestDb
let world: PermitWorld

beforeEach(async () => {
  handle = await makeTestDb()
  world = await setupPermitWorld(handle.db)
})
afterEach(async () => {
  await handle.drop()
})

const PROFILE = {
  name: 'Pat Builder',
  phone: '603-555-0142',
  mailingAddress: '12 Mill Road, Alder Pond, NH 03200',
  companyName: 'Builder and Sons',
  trades: ['electrical' as const],
  licenses: [{ trade: 'electrical' as const, number: 'EL-20418' }],
}

async function account(input: { email?: string; role?: 'applicant' | 'staff' } = {}) {
  const id = await makeUser(handle.db, {
    role: input.role ?? 'applicant',
    email: input.email ?? EMAIL,
  })
  return (await loadActor(handle.db, id, signal)) as Actor
}

async function contractorParty(projectId = world.projectId, email = EMAIL) {
  const added = await addParty(
    handle.db,
    world.staff,
    { projectId, role: 'contractor', name: 'Pat Builder', email },
    signal,
  )
  if (!added.ok) throw new Error('party')
  return added.value.partyId
}

async function partyUser(partyId: string) {
  const [row] = await handle.db
    .select({ userId: projectParties.userId })
    .from(projectParties)
    .where(eq(projectParties.id, partyId))
  return row?.userId ?? null
}

async function secondProject(): Promise<string> {
  const made = await createProject(
    handle.db,
    world.applicant,
    { parcelId: world.parcelId, title: 'Porch' },
    signal,
  )
  if (!made.ok) throw new Error('project')
  return made.value.projectId
}

const linkAudits = () =>
  handle.db.select().from(auditLog).where(eq(auditLog.action, 'contractor.party.link'))

describe('contractor sign-up links existing parties by verified email', () => {
  it('links parties on two projects, audits each, adds the role and fills the dashboard', async () => {
    const first = await contractorParty()
    const second = await contractorParty(await secondProject(), 'PAT@Builder.example')
    const actor = await account()
    const saved = await saveContractorProfile(handle.db, actor, PROFILE, signal)
    expect(saved).toEqual({ ok: true, value: { created: true, linkedParties: 2 } })
    expect(await partyUser(first)).toBe(actor.userId)
    expect(await partyUser(second)).toBe(actor.userId)
    const audits = await linkAudits()
    expect(audits.map((a) => (a.after as { partyId: string }).partyId).sort()).toEqual(
      [first, second].sort(),
    )
    const roles = await handle.db.select().from(userRoles).where(eq(userRoles.userId, actor.userId))
    expect(roles.map((r) => r.role).sort()).toEqual(['applicant', 'contractor'])
    const page = await listContractorProjects(handle.db, actor, { limit: 25 }, signal)
    expect(page.rows).toHaveLength(2)
  })

  it('never links a removed party, an applicant party, or a party claimed by someone else', async () => {
    const removed = await contractorParty()
    expect((await removeParty(handle.db, world.staff, removed, signal)).ok).toBe(true)
    const applicantParty = await addParty(
      handle.db,
      world.staff,
      { projectId: world.projectId, role: 'applicant', name: 'Pat', email: EMAIL },
      signal,
    )
    const other = await account({ email: 'other@builder.example' })
    const [taken] = await handle.db
      .insert(projectParties)
      .values({
        projectId: world.projectId,
        role: 'contractor',
        name: 'Pat Builder',
        email: EMAIL,
        userId: other.userId,
        addedBy: world.staff.userId,
      })
      .returning({ id: projectParties.id })
    const actor = await account()
    const saved = await saveContractorProfile(handle.db, actor, PROFILE, signal)
    expect(saved.ok && saved.value.linkedParties).toBe(0)
    expect(await partyUser(removed)).toBeNull()
    expect(applicantParty.ok && (await partyUser(applicantParty.value.partyId))).toBeNull()
    expect(await partyUser(taken?.id ?? '')).toBe(other.userId)
    const app = await makeApplication(handle.db, world)
    expect(await canViewApplication(handle.db, actor, app.applicationId, signal)).toBe(false)
    expect(await linkAudits()).toEqual([])
  })

  it('refuses a staff account and links nothing for it', async () => {
    const party = await contractorParty()
    const staff = await account({ role: 'staff' })
    expect(await saveContractorProfile(handle.db, staff, PROFILE, signal)).toEqual({
      ok: false,
      error: 'forbidden',
    })
    expect(await partyUser(party)).toBeNull()
  })

  it('keeps the account on later saves without linking twice', async () => {
    await contractorParty()
    const actor = await account()
    await saveContractorProfile(handle.db, actor, PROFILE, signal)
    const again = await saveContractorProfile(
      handle.db,
      actor,
      { ...PROFILE, companyName: 'Builder and Daughters' },
      signal,
    )
    expect(again).toEqual({ ok: true, value: { created: false, linkedParties: 0 } })
    expect(await linkAudits()).toHaveLength(1)
  })
})

describe('parties added after sign-up', () => {
  it('links a contractor party added with the account email at once', async () => {
    const actor = await account()
    await saveContractorProfile(handle.db, actor, PROFILE, signal)
    const party = await contractorParty()
    expect(await partyUser(party)).toBe(actor.userId)
    const [audit] = await linkAudits()
    expect(audit).toMatchObject({ actorUserId: world.staff.userId, entityId: world.projectId })
    expect(audit?.after).toEqual({ partyId: party, userId: actor.userId, match: 'verified_email' })
  })

  it('shows staff which account and company the party is linked to', async () => {
    const actor = await account()
    await saveContractorProfile(handle.db, actor, PROFILE, signal)
    const party = await contractorParty()
    const parties = await loadViewParties(handle.db, world.projectId)
    expect(parties.find((p) => p.id === party)).toMatchObject({
      linked: true,
      account: { email: EMAIL, companyName: 'Builder and Sons' },
    })
  })

  it('leaves the party unlinked for an account without a contractor profile', async () => {
    await account()
    expect(await partyUser(await contractorParty())).toBeNull()
  })

  it('leaves the party unlinked once the contractor account is disabled', async () => {
    const actor = await account()
    await saveContractorProfile(handle.db, actor, PROFILE, signal)
    await handle.db.update(users).set({ isActive: false }).where(eq(users.id, actor.userId))
    expect(await partyUser(await contractorParty())).toBeNull()
  })

  it('removing a linked party takes the project off the dashboard', async () => {
    const actor = await account()
    await saveContractorProfile(handle.db, actor, PROFILE, signal)
    const party = await contractorParty()
    await removeParty(handle.db, world.staff, party, signal)
    expect((await listContractorProjects(handle.db, actor, { limit: 25 }, signal)).rows).toEqual([])
    const [row] = await handle.db
      .select()
      .from(projectParties)
      .where(and(eq(projectParties.id, party), eq(projectParties.userId, actor.userId)))
    expect(row?.removedAt).not.toBeNull()
  })
})
