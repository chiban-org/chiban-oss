import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { canViewApplication, canViewProject } from '@/features/access/queries'
import type { Actor } from '@/features/auth/actor'
import { listDocuments } from '@/features/documents/listDocuments'
import { setAudiences } from '@/features/documents/publish'
import type { Audience, RecordRef } from '@/features/documents/types'
import { resolveRendition } from '@/features/documents/visibility'
import { createMemoryTransport } from '@/features/mail/memoryTransport'
import { createProject } from '@/features/projects/projects'
import { assignBoardForComment, withdrawBoardAssignment } from '@/features/reviews/boardAssignments'
import type { ObjectStore } from '@/features/storage/objectStore'
import { makeApplication } from '@/test/applicationFixtures'
import { type BoardWorld, setupBoardWorld } from '@/test/boardFixtures'
import { addBoard, seatMember } from '@/test/boardReviewFixtures'
import { makeTestDb, type TestDb } from '@/test/db'
import { pdfBytes, uploadAs } from '@/test/documentFixtures'
import { makeTestStore } from '@/test/objectStore'

const signal = new AbortController().signal
let handle: TestDb
let store: ObjectStore
let world: BoardWorld
let seated: Actor
let unassigned: Actor
let former: Actor
let assignedApp = ''
let assignedProject = ''
let withdrawnApp = ''
let withdrawnProject = ''
const docs = {
  appReviewers: '',
  projectReviewers: '',
  staffOnly: '',
  boardOnly: '',
  withdrawnReviewers: '',
}

async function doc(target: RecordRef, title: string, audiences: Audience[]): Promise<string> {
  const made = await uploadAs(handle.db, store, world.staff, target, pdfBytes(title), { title })
  const set = await setAudiences(
    handle.db,
    world.admin,
    { documentId: made.documentId, audiences },
    signal,
  )
  if (!set.ok) throw new Error(set.error)
  return made.documentId
}

async function seen(actor: Actor | null, record: RecordRef): Promise<string[]> {
  const page = await listDocuments(handle.db, actor, { record, limit: 100 }, signal)
  return page.rows.map((r) => r.documentId)
}

async function downloads(actor: Actor | null, documentId: string): Promise<boolean> {
  return (await resolveRendition(handle.db, actor, documentId, signal)).ok
}

async function sees(actor: Actor | null, applicationId: string, projectId: string) {
  return {
    application: await canViewApplication(handle.db, actor, applicationId, signal),
    project: await canViewProject(handle.db, actor, projectId, signal),
    appDocs: await seen(actor, { kind: 'application', id: applicationId }),
    projectDocs: await seen(actor, { kind: 'project', id: projectId }),
  }
}

const NOTHING = { application: false, project: false, appDocs: [], projectDocs: [] }

beforeAll(async () => {
  handle = await makeTestDb()
  ;({ store } = await makeTestStore())
  world = await setupBoardWorld(handle.db)
  const conservation = await addBoard(handle.db, {
    kind: 'conservation_commission',
    name: 'Alder Pond Conservation Commission',
    shortName: 'Conservation Commission',
  })
  const historic = await addBoard(handle.db, {
    kind: 'historic_district_commission',
    name: 'Alder Pond Historic District Commission',
    shortName: 'Historic District Commission',
  })
  seated = await seatMember(handle.db, world.staff, {
    email: 'lee.marsh@alderpond.example',
    displayName: 'Lee Marsh',
    boardId: conservation,
  })
  former = await seatMember(handle.db, world.staff, {
    email: 'pat.former@alderpond.example',
    displayName: 'Pat Former',
    boardId: conservation,
    termStart: '2019-01-01',
    termEnd: '2020-06-30',
  })
  unassigned = await seatMember(handle.db, world.staff, {
    email: 'hal.historic@alderpond.example',
    displayName: 'Hal Historic',
    boardId: historic,
  })
  assignedProject = world.projectId
  assignedApp = (
    await makeApplication(handle.db, world, { state: 'under_review' }, undefined, 'SPR')
  ).applicationId
  const other = await createProject(
    handle.db,
    world.applicant,
    { parcelId: world.parcelId, title: 'Barn conversion' },
    signal,
  )
  if (!other.ok) throw new Error('project')
  withdrawnProject = other.value.projectId
  withdrawnApp = (
    await makeApplication(
      handle.db,
      { ...world, projectId: withdrawnProject },
      {
        state: 'under_review',
      },
    )
  ).applicationId
  docs.appReviewers = await doc({ kind: 'application', id: assignedApp }, 'Wetland plan', [
    'reviewers',
  ])
  docs.projectReviewers = await doc({ kind: 'project', id: assignedProject }, 'Survey', [
    'reviewers',
  ])
  docs.staffOnly = await doc({ kind: 'application', id: assignedApp }, 'Staff memo', [])
  docs.boardOnly = await doc({ kind: 'application', id: assignedApp }, 'Board memo', ['board'])
  docs.withdrawnReviewers = await doc({ kind: 'application', id: withdrawnApp }, 'Barn plan', [
    'reviewers',
  ])
  const mail = createMemoryTransport()
  const sent = await assignBoardForComment(
    handle.db,
    mail,
    world.staff,
    { applicationId: assignedApp, boardId: conservation, commentBy: null },
    signal,
  )
  if (!sent.ok) throw new Error(sent.error)
  const toWithdraw = await assignBoardForComment(
    handle.db,
    mail,
    world.staff,
    { applicationId: withdrawnApp, boardId: conservation, commentBy: null },
    signal,
  )
  if (!toWithdraw.ok) throw new Error(toWithdraw.error)
  const withdrawn = await withdrawBoardAssignment(
    handle.db,
    world.staff,
    { assignmentId: toWithdraw.value.assignmentId },
    signal,
  )
  if (!withdrawn.ok) throw new Error(withdrawn.error)
})

afterAll(async () => {
  await handle.drop()
})

describe('what a member of an assigned board can see', () => {
  it('a seated member sees the application, its project and the reviewers documents only', async () => {
    const view = await sees(seated, assignedApp, assignedProject)
    expect(view.application).toBe(true)
    expect(view.project).toBe(true)
    expect(view.appDocs).toEqual([docs.appReviewers])
    expect(view.projectDocs).toEqual([docs.projectReviewers])
    expect(await downloads(seated, docs.appReviewers)).toBe(true)
    expect(await downloads(seated, docs.projectReviewers)).toBe(true)
  })

  it('a board member never gets a staff-only or board-audience document', async () => {
    expect(await downloads(seated, docs.staffOnly)).toBe(false)
    expect(await downloads(seated, docs.boardOnly)).toBe(false)
  })

  it('a member of a board that was not sent the application sees none of it', async () => {
    expect(await sees(unassigned, assignedApp, assignedProject)).toEqual(NOTHING)
    expect(await downloads(unassigned, docs.appReviewers)).toBe(false)
  })

  it('a former member whose term ended sees none of it', async () => {
    expect(await sees(former, assignedApp, assignedProject)).toEqual(NOTHING)
    expect(await downloads(former, docs.appReviewers)).toBe(false)
  })

  it('a seated member sees none of an application once the request is withdrawn', async () => {
    expect(await sees(seated, withdrawnApp, withdrawnProject)).toEqual(NOTHING)
    expect(await downloads(seated, docs.withdrawnReviewers)).toBe(false)
  })

  it('signed-out access is unchanged', async () => {
    expect(await sees(null, assignedApp, assignedProject)).toEqual(NOTHING)
    expect(await downloads(null, docs.appReviewers)).toBe(false)
  })
})
