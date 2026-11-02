import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { documents, legalHolds } from '@/db/schema'
import type { Actor } from '@/features/auth/actor'
import { makeApplication, type PermitWorld, setupPermitWorld } from '@/test/applicationFixtures'
import { makeTestDb, type TestDb } from '@/test/db'
import { pdfBytes, uploadAs } from '@/test/documentFixtures'
import { makeTestStore } from '@/test/minio'
import { staffActor } from '@/test/parcels'

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

let handle: TestDb
let world: PermitWorld
let documentId = ''
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
  const app = await makeApplication(handle.db, world)
  documentId = (
    await uploadAs(
      handle.db,
      store,
      world.applicant,
      { kind: 'application', id: app.applicationId },
      pdfBytes('records'),
    )
  ).documentId
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
    const result = await actions.setPublicAction(form({ documentId, isPublic: 'true' }, null))
    expect(result).toMatchObject({ ok: false, error: expect.stringContaining('expired') })
    const [doc] = await handle.db.select().from(documents).where(eq(documents.id, documentId))
    expect(doc?.isPublic).toBe(false)
  })

  it('staff can publish and set audiences; a reviewer cannot', async () => {
    expect(await actions.setPublicAction(form({ documentId, isPublic: 'true' }))).toMatchObject({
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
      await actions.recordBuildingRemovedAction(form({ projectId, occurredOn: '2040-06-01' })),
    ).toMatchObject({ ok: true })
    state.actor = world.reviewer
    expect(
      await actions.recordBuildingRemovedAction(form({ projectId, occurredOn: '2040-06-01' })),
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
    expect(await actions.createStaffUploadIntentAction(form(base))).toMatchObject({ ok: false })
    expect(
      await actions.createStaffUploadIntentAction(
        form({ ...base, seriesKey: 'nh.rs.blueprints_architectural' }),
      ),
    ).toMatchObject({ ok: true })
  })
})
