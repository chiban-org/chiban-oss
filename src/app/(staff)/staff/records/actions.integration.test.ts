import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { documents, legalHolds, projects } from '@/db/schema'
import type { Actor } from '@/features/auth/actor'
import { holdSubjects } from '@/features/records/holds'
import type { ObjectStore } from '@/features/storage/objectStore'
import { refuseField } from '@/server/formInput'
import { makeApplication, type PermitWorld, setupPermitWorld } from '@/test/applicationFixtures'
import { makeTestDb, type TestDb } from '@/test/db'
import { pdfBytes, uploadAs } from '@/test/documentFixtures'
import { makeTestStore } from '@/test/objectStore'
import { staffActor } from '@/test/parcels'
import { approvePublic } from '@/test/renditionFixtures'

interface MockState {
  db: unknown
  csrf: string | null
  actor: Actor | null
}

const state = vi.hoisted((): MockState => ({ db: null, csrf: 'tok', actor: null }))

vi.mock('@/db/client', () => ({
  get db() {
    return state.db
  },
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('next/headers', () => ({
  cookies: () =>
    Promise.resolve({
      get: (name: string) =>
        name === 'chiban_csrf' && state.csrf !== null ? { value: state.csrf } : undefined,
    }),
  headers: () =>
    Promise.resolve(
      new Headers({
        origin: 'https://alderpond.example',
        host: 'alderpond.example',
        'sec-fetch-site': 'same-origin',
      }),
    ),
}))
vi.mock('@/server/getActor', () => ({ getActor: () => Promise.resolve(state.actor) }))

const actions = await import('./actions')
const uploadActions = await import('./uploadActions')

let handle: TestDb
let world: PermitWorld
let documentId = ''
let versionId = ''
let testStore: ObjectStore
let projectId = ''

function form(fields: Record<string, string>, token: string | null = 'tok'): FormData {
  const f = new FormData()
  if (token !== null) f.set('csrf_token', token)
  for (const [k, v] of Object.entries(fields)) f.set(k, v)
  return f
}

beforeAll(async () => {
  handle = await makeTestDb()
  state.db = handle.db
  world = await setupPermitWorld(handle.db)
  projectId = world.projectId
  const { store } = await makeTestStore()
  testStore = store
  const app = await makeApplication(handle.db, world)
  const uploaded = await uploadAs(
    handle.db,
    store,
    world.applicant,
    { kind: 'application', id: app.applicationId },
    pdfBytes('records'),
  )
  documentId = uploaded.documentId
  versionId = uploaded.versionId
})
afterAll(async () => {
  await handle.drop()
})
beforeEach(() => {
  state.csrf = 'tok'
  state.actor = world.staff
})

describe('records actions', () => {
  it('setPublicAction without csrf is refused', async () => {
    const result = await actions.setPublicAction(form({ documentId, isPublic: 'yes' }, null))
    expect(result).toMatchObject({ ok: false, error: expect.stringContaining('expired') })
    const [doc] = await handle.db.select().from(documents).where(eq(documents.id, documentId))
    expect(doc?.isPublic).toBe(false)
  })

  it('setPublicAction without an approved version tells staff to approve one first', async () => {
    expect(await actions.setPublicAction(form({ documentId, isPublic: 'yes' }))).toMatchObject({
      ok: false,
      error: expect.stringContaining('Approve a version'),
    })
  })

  it('staff can publish and set audiences; a reviewer cannot', async () => {
    await approvePublic(handle.db, world.staff, versionId, testStore)
    expect(await actions.setPublicAction(form({ documentId, isPublic: 'yes' }))).toMatchObject({
      ok: true,
    })
    const set = await actions.setAudiencesAction(
      (() => {
        const f = form({ documentId })
        f.append('audience', 'project_parties')
        f.append('audience', 'board')
        return f
      })(),
    )
    expect(set).toMatchObject({ ok: true })
    const [doc] = await handle.db.select().from(documents).where(eq(documents.id, documentId))
    expect(doc).toMatchObject({ isPublic: true, audiences: ['project_parties', 'board'] })
    state.actor = world.reviewer
    expect(await actions.setPublicAction(form({ documentId, isPublic: 'false' }))).toMatchObject({
      ok: false,
    })
    expect(await actions.setAudiencesAction(form({ documentId }))).toMatchObject({ ok: false })
  })

  it('placeHoldAction as staff is forbidden; a records custodian places and releases', async () => {
    const hold = {
      targetKind: 'project',
      targetId: projectId,
      reason: 'Litigation pending on site',
    }
    expect(await actions.placeHoldAction(form(hold))).toMatchObject({
      ok: false,
      error: expect.stringContaining('permission'),
    })
    state.actor = await staffActor(handle.db, 'records_custodian')
    expect(await actions.placeHoldAction(form(hold))).toMatchObject({ ok: true })
    const [row] = await handle.db.select().from(legalHolds)
    expect(
      await actions.releaseHoldAction(form({ holdId: row?.id ?? '', reason: 'short' })),
    ).toMatchObject({ ok: false })
    expect(
      await actions.releaseHoldAction(
        form({ holdId: row?.id ?? '', reason: 'Case closed in court' }),
      ),
    ).toMatchObject({ ok: true })
  })

  it('placeHoldAction resolves an application number and a project title; an unknown reference is refused', async () => {
    state.actor = await staffActor(handle.db, 'records_custodian')
    const made = await makeApplication(handle.db, world)
    const reason = 'Litigation pending on site'
    expect(
      await actions.placeHoldAction(
        form({ targetKind: 'application', targetRef: made.number, reason }),
      ),
    ).toMatchObject({ ok: true })
    const held = await handle.db
      .select()
      .from(legalHolds)
      .where(eq(legalHolds.targetId, made.applicationId))
    expect(held).toHaveLength(1)
    expect(
      await actions.placeHoldAction(
        form({ targetKind: 'application', targetRef: 'NOPE-0000', reason }),
      ),
    ).toMatchObject({ ok: false, error: expect.stringContaining('No record was found') })
    const [project] = await handle.db
      .select({ title: projects.title })
      .from(projects)
      .where(eq(projects.id, projectId))
    expect(
      await actions.placeHoldAction(
        form({ targetKind: 'project', targetRef: project?.title ?? '', reason }),
      ),
    ).toMatchObject({ ok: true })
  })

  it('placeHoldAction refuses a document that was already disposed of, by title or by id', async () => {
    state.actor = await staffActor(handle.db, 'records_custodian')
    const app = await makeApplication(handle.db, world)
    const gone = await uploadAs(
      handle.db,
      testStore,
      world.applicant,
      { kind: 'application', id: app.applicationId },
      pdfBytes('disposed letter'),
      { title: 'Disposed letter for the hold test' },
    )
    await handle.db
      .update(documents)
      .set({ disposedAt: new Date() })
      .where(eq(documents.id, gone.documentId))
    const reason = 'Litigation pending on site'
    for (const targetRef of ['Disposed letter for the hold test', gone.documentId]) {
      expect(
        await actions.placeHoldAction(form({ targetKind: 'document', targetRef, reason })),
      ).toEqual(
        refuseField(
          'targetRef',
          'That document was already disposed of, so there is nothing left to hold.',
        ),
      )
    }
    const held = await handle.db
      .select()
      .from(legalHolds)
      .where(eq(legalHolds.targetId, gone.documentId))
    expect(held).toEqual([])
  })

  it('placeHoldAction by reference is still forbidden for staff without the hold capability', async () => {
    state.actor = world.staff
    const made = await makeApplication(handle.db, world)
    expect(
      await actions.placeHoldAction(
        form({
          targetKind: 'application',
          targetRef: made.number,
          reason: 'Litigation pending on site',
        }),
      ),
    ).toMatchObject({ ok: false, error: expect.stringContaining('permission') })
  })

  it('holdSubjects names an application hold by its number and a project hold by its title', async () => {
    const rows = await handle.db.select().from(legalHolds)
    const subjects = await holdSubjects(handle.db, rows)
    const appHold = rows.find((r) => r.targetKind === 'application')
    expect(appHold).toBeDefined()
    expect(subjects.get(appHold?.id ?? '')).toMatch(/^[A-Z]+-/)
    const projectHold = rows.find((r) => r.targetKind === 'project')
    expect(subjects.get(projectHold?.id ?? '')).toBeTruthy()
  })

  it('a series can be chosen from the pack and an unknown one is refused', async () => {
    expect(
      await actions.assignSeriesAction(
        form({ documentId, seriesKey: 'nh.rs.blueprints_architectural' }),
      ),
    ).toMatchObject({ ok: true })
    expect(await actions.assignSeriesAction(form({ documentId, seriesKey: 'nope' }))).toMatchObject(
      { ok: false },
    )
  })

  it('recording a building removal needs document.manage', async () => {
    expect(
      await actions.recordBuildingRemovedAction(form({ projectId, occurredOn: '2026-06-01' })),
    ).toMatchObject({ ok: true })
    state.actor = world.reviewer
    expect(
      await actions.recordBuildingRemovedAction(form({ projectId, occurredOn: '2026-06-01' })),
    ).toMatchObject({ ok: false })
  })

  it('staff upload intent for a parcel needs a series', async () => {
    const base = {
      targetKind: 'parcel',
      targetId: world.parcelId,
      title: 'Plat',
      filename: 'plat.pdf',
      contentType: 'application/pdf',
      sizeBytes: '20',
    }
    expect(await uploadActions.createStaffUploadIntentAction(form(base))).toMatchObject({
      ok: false,
    })
    expect(
      await uploadActions.createStaffUploadIntentAction(
        form({ ...base, seriesKey: 'nh.rs.blueprints_architectural' }),
      ),
    ).toMatchObject({ ok: true })
  })
})
