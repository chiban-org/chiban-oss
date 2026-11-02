import { eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { projectParties } from '@/db/schema'
import { addParty, removeParty } from '@/features/projects/parties'
import { createProject } from '@/features/projects/projects'
import { makeTestDb, type TestDb } from '@/test/db'
import { makeParcel, seedParcelWorld, staffActor } from '@/test/parcels'

const signal = new AbortController().signal
let handle: TestDb
let parcelId: string

beforeEach(async () => {
  handle = await makeTestDb()
  await seedParcelWorld(handle.db)
  parcelId = await makeParcel(handle.db, [{ format: 'gis12', value: '007001000000' }])
})
afterEach(async () => {
  await handle.drop()
})

async function projectOf(actor: Awaited<ReturnType<typeof staffActor>>) {
  const r = await createProject(handle.db, actor, { parcelId, title: 'Garage addition' }, signal)
  if (!r.ok) throw new Error('project failed')
  return r.value.projectId
}

describe('project parties', () => {
  it('agent without owner authorization is refused', async () => {
    const applicant = await staffActor(handle.db, 'applicant')
    const projectId = await projectOf(applicant)
    const refused = await addParty(
      handle.db,
      applicant,
      { projectId, role: 'agent', name: 'Casey Agent', email: 'casey@alderpond.example' },
      signal,
    )
    expect(refused).toEqual({ ok: false, error: 'agent_needs_owner_authorization' })
    const allowed = await addParty(
      handle.db,
      applicant,
      {
        projectId,
        role: 'agent',
        name: 'Casey Agent',
        email: 'casey@alderpond.example',
        ownerAuthorizationOnFile: true,
      },
      signal,
    )
    expect(allowed.ok).toBe(true)
  })

  it('applicant can add a party to own project, not to another', async () => {
    const mine = await staffActor(handle.db, 'applicant')
    const theirs = await staffActor(handle.db, 'applicant')
    const myProject = await projectOf(mine)
    const theirProject = await projectOf(theirs)
    const input = {
      role: 'contractor' as const,
      name: 'Pat Builder',
      email: 'pat@alderpond.example',
    }
    expect((await addParty(handle.db, mine, { ...input, projectId: myProject }, signal)).ok).toBe(
      true,
    )
    expect(await addParty(handle.db, mine, { ...input, projectId: theirProject }, signal)).toEqual({
      ok: false,
      error: 'forbidden',
    })
  })

  it('staff with project.manage_parties can add; a reviewer cannot', async () => {
    const applicant = await staffActor(handle.db, 'applicant')
    const projectId = await projectOf(applicant)
    const staff = await staffActor(handle.db, 'staff')
    const reviewer = await staffActor(handle.db, 'reviewer')
    const input = {
      projectId,
      role: 'contractor' as const,
      name: 'Pat Builder',
      email: 'pat@alderpond.example',
    }
    expect((await addParty(handle.db, staff, input, signal)).ok).toBe(true)
    expect(await addParty(handle.db, reviewer, input, signal)).toEqual({
      ok: false,
      error: 'forbidden',
    })
  })

  it('creating a project as an applicant makes them an active applicant party', async () => {
    const applicant = await staffActor(handle.db, 'applicant')
    const projectId = await projectOf(applicant)
    const rows = await handle.db
      .select()
      .from(projectParties)
      .where(eq(projectParties.projectId, projectId))
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ userId: applicant.userId, role: 'applicant', removedAt: null })
  })

  it('removing a party stamps removed_at and only authorized actors may remove', async () => {
    const applicant = await staffActor(handle.db, 'applicant')
    const stranger = await staffActor(handle.db, 'applicant')
    const projectId = await projectOf(applicant)
    const added = await addParty(
      handle.db,
      applicant,
      { projectId, role: 'contractor', name: 'Pat Builder', email: 'pat@alderpond.example' },
      signal,
    )
    if (!added.ok) throw new Error('add failed')
    expect(await removeParty(handle.db, stranger, added.value.partyId, signal)).toEqual({
      ok: false,
      error: 'forbidden',
    })
    expect((await removeParty(handle.db, applicant, added.value.partyId, signal)).ok).toBe(true)
    const [row] = await handle.db
      .select()
      .from(projectParties)
      .where(eq(projectParties.id, added.value.partyId))
    expect(row?.removedAt).not.toBeNull()
  })

  it('creating a project for an unknown parcel is refused', async () => {
    const applicant = await staffActor(handle.db, 'applicant')
    const r = await createProject(
      handle.db,
      applicant,
      { parcelId: '00000000-0000-4000-8000-000000000000', title: 'X' },
      signal,
    )
    expect(r).toEqual({ ok: false, error: 'unknown_parcel' })
  })
})
