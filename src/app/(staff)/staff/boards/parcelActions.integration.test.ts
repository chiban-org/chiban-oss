import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { applicationParcels } from '@/db/schema'
import { applicantParcelIds } from '@/features/abutters/applicantParcels'
import { lockApplication } from '@/features/applications/lockApplication'
import { displayIdsFor } from '@/features/parcels/displayId'
import { type BoardWorld, setupBoardWorld } from '@/test/boardFixtures'
import { makeTestDb, type TestDb } from '@/test/db'
import { type ListWorld, prepareListWorld } from '@/test/listFixtures'
import { blockedOrSettled, holdOpen } from '@/test/lockWait'

interface MockState {
  db: unknown
  actor: unknown
}

const state = vi.hoisted((): MockState => ({ db: null, actor: null }))

vi.mock('@/db/client', () => ({
  get db() {
    return state.db
  },
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('next/headers', () => ({
  cookies: () =>
    Promise.resolve({
      get: (name: string) => (name === 'chiban_csrf' ? { value: 'tok' } : undefined),
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

const boardActions = await import('@/app/(staff)/staff/boards/actions')

const signal = new AbortController().signal
let handle: TestDb
let world: BoardWorld
let lw: ListWorld

beforeAll(async () => {
  handle = await makeTestDb()
  state.db = handle.db
  world = await setupBoardWorld(handle.db)
  lw = await prepareListWorld(handle.db, world)
  state.actor = world.staff
})
afterAll(async () => {
  await handle.drop()
})

function form(values: Record<string, string>): FormData {
  const data = new FormData()
  data.set('csrf_token', 'tok')
  for (const [key, value] of Object.entries(values)) data.set(key, value)
  return data
}

describe('addApplicantParcelAction', () => {
  it('an addition made while another is uncommitted keeps both parcels', async () => {
    const [a, m4, m6] = [lw.ids.A ?? '', lw.ids.M4 ?? '', lw.ids.M6 ?? '']
    const labels = await displayIdsFor(handle.db, [m6])
    const inFlight = await holdOpen(handle.db, async (tx) => {
      await lockApplication(tx, lw.applicationId)
      await tx
        .delete(applicationParcels)
        .where(eq(applicationParcels.applicationId, lw.applicationId))
      await tx.insert(applicationParcels).values(
        [a, m4].map((parcelId) => ({
          applicationId: lw.applicationId,
          parcelId,
          addedBy: world.staff.userId,
        })),
      )
    })
    const adding = boardActions
      .addApplicantParcelAction(
        form({ applicationId: lw.applicationId, parcelRef: labels.get(m6) ?? '' }),
      )
      .catch((e: unknown) => ({ ok: false as const, error: String(e) }))
    await blockedOrSettled(handle.db, adding)
    await inFlight.commit()
    expect(await adding).toEqual({ ok: true, message: 'Parcels for this application updated.' })
    expect((await applicantParcelIds(handle.db, lw.applicationId, signal)).sort()).toEqual(
      [a, m4, m6].sort(),
    )
  })
})
