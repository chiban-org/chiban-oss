import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  canViewApplication,
  canViewProject,
  countApplicationsForViewer,
  isProjectParty,
} from '@/features/access/queries'
import { listApplicationsForViewer } from '@/features/applications/listForViewer'
import type { Actor } from '@/features/auth/actor'
import { loadActor } from '@/features/auth/actor'
import { addParty, removeParty } from '@/features/projects/parties'
import { createProject } from '@/features/projects/projects'
import { assignReviewer, removeReviewer } from '@/features/reviews/assignments'
import { makeTestCaller } from '@/server/testCaller'
import { makeApplication, type PermitWorld, setupPermitWorld } from '@/test/applicationFixtures'
import { makeTestDb, type TestDb } from '@/test/db'
import { makeUser } from '@/test/factories'
import { staffActor } from '@/test/parcels'

const signal = new AbortController().signal
let handle: TestDb
let world: PermitWorld
let otherApplicant: Actor
let otherProjectId: string
let mineApp: string
let theirApp: string

async function actorFor(userId: string): Promise<Actor> {
  const actor = await loadActor(handle.db, userId, signal)
  if (actor === null) throw new Error('actor')
  return actor
}

async function visibility(actor: Actor | null, applicationId: string) {
  const list =
    actor === null
      ? []
      : (await listApplicationsForViewer(handle.db, actor, { limit: 100 }, signal)).rows
  return {
    inList: list.some((r) => r.id === applicationId),
    total: actor === null ? 0 : await countApplicationsForViewer(handle.db, actor, signal),
    canView: await canViewApplication(handle.db, actor, applicationId, signal),
  }
}

beforeAll(async () => {
  handle = await makeTestDb()
  world = await setupPermitWorld(handle.db)
  mineApp = (await makeApplication(handle.db, world)).applicationId
  otherApplicant = await staffActor(handle.db, 'applicant')
  const project = await createProject(
    handle.db,
    otherApplicant,
    { parcelId: world.parcelId, title: 'Deck' },
    signal,
  )
  if (!project.ok) throw new Error('project')
  otherProjectId = project.value.projectId
  const made = await makeApplication(handle.db, {
    ...world,
    projectId: otherProjectId,
    applicant: otherApplicant,
  })
  theirApp = made.applicationId
})
afterAll(async () => {
  await handle.drop()
})

describe('application visibility', () => {
  it("another applicant's application is invisible in list, count, and get", async () => {
    const seen = await visibility(world.applicant, theirApp)
    expect(seen).toEqual({ inList: false, total: 1, canView: false })
    const caller = makeTestCaller(handle.db, world.applicant)
    await expect(caller.applications.get({ id: theirApp })).rejects.toMatchObject({
      code: 'NOT_FOUND',
    })
    const own = await caller.applications.get({ id: mineApp })
    expect(own.id).toBe(mineApp)
  })

  it('anonymous viewers see nothing', async () => {
    expect(await canViewApplication(handle.db, null, mineApp, signal)).toBe(false)
  })

  it('unclaimed contractor email party sees nothing', async () => {
    const added = await addParty(
      handle.db,
      world.staff,
      {
        projectId: world.projectId,
        role: 'contractor',
        name: 'Pat Builder',
        email: 'pat@alderpond.example',
      },
      signal,
    )
    expect(added.ok).toBe(true)
    const contractor = await actorFor(
      await makeUser(handle.db, { role: 'contractor', email: 'pat@alderpond.example' }),
    )
    expect(await visibility(contractor, mineApp)).toEqual({
      inList: false,
      total: 0,
      canView: false,
    })
    expect(await canViewProject(handle.db, contractor, world.projectId, signal)).toBe(false)
  })

  it('unassigned reviewer sees nothing; assigned reviewer sees exactly one', async () => {
    expect(await visibility(world.reviewer, mineApp)).toEqual({
      inList: false,
      total: 0,
      canView: false,
    })
    const assigned = await assignReviewer(
      handle.db,
      world.staff,
      { applicationId: mineApp, reviewerUserId: world.reviewer.userId },
      signal,
    )
    expect(assigned.ok).toBe(true)
    expect(await visibility(world.reviewer, mineApp)).toEqual({
      inList: true,
      total: 1,
      canView: true,
    })
    expect(await visibility(world.reviewer, theirApp)).toEqual({
      inList: false,
      total: 1,
      canView: false,
    })
    expect(await canViewProject(handle.db, world.reviewer, world.projectId, signal)).toBe(true)
    expect(await canViewProject(handle.db, world.reviewer, otherProjectId, signal)).toBe(false)
    if (!assigned.ok) return
    await removeReviewer(
      handle.db,
      world.staff,
      { assignmentId: assigned.value.assignmentId },
      signal,
    )
  })

  it('removed reviewer loses access', async () => {
    expect(await visibility(world.reviewer, mineApp)).toEqual({
      inList: false,
      total: 0,
      canView: false,
    })
  })

  it('removed party loses access', async () => {
    const added = await addParty(
      handle.db,
      world.staff,
      {
        projectId: otherProjectId,
        role: 'owner',
        name: 'Owen Owner',
        userId: world.applicant.userId,
      },
      signal,
    )
    if (!added.ok) throw new Error('party')
    expect((await visibility(world.applicant, theirApp)).canView).toBe(true)
    await removeParty(handle.db, world.staff, added.value.partyId, signal)
    expect((await visibility(world.applicant, theirApp)).canView).toBe(false)
    expect(
      await isProjectParty(handle.db, world.applicant, otherProjectId, ['owner'], signal),
    ).toBe(false)
  })

  it('board member account without a membership sees nothing', async () => {
    const board = await staffActor(handle.db, 'board_member')
    expect(await visibility(board, mineApp)).toEqual({ inList: false, total: 0, canView: false })
  })

  it('inspector sees all', async () => {
    const inspector = await staffActor(handle.db, 'inspector')
    expect((await visibility(inspector, theirApp)).canView).toBe(true)
    expect((await visibility(inspector, mineApp)).canView).toBe(true)
  })

  it('applicant sees 2 of 32 with limit 25 and count 2', async () => {
    for (let i = 0; i < 30; i += 1) {
      await makeApplication(handle.db, {
        ...world,
        projectId: otherProjectId,
        applicant: otherApplicant,
      })
    }
    const lone = await staffActor(handle.db, 'applicant')
    const project = await createProject(
      handle.db,
      lone,
      { parcelId: world.parcelId, title: 'Shed' },
      signal,
    )
    if (!project.ok) throw new Error('project')
    for (let i = 0; i < 2; i += 1) {
      await makeApplication(handle.db, {
        ...world,
        projectId: project.value.projectId,
        applicant: lone,
      })
    }
    const page = await listApplicationsForViewer(handle.db, lone, { limit: 25 }, signal)
    expect(page.rows).toHaveLength(2)
    expect(page.nextCursor).toBeNull()
    expect(await countApplicationsForViewer(handle.db, lone, signal)).toBe(2)
  })
})
