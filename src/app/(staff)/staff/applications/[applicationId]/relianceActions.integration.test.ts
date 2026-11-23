import { eq } from 'drizzle-orm'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { relianceLinks } from '@/db/schema'
import type { Actor } from '@/features/auth/actor'
import { setActivePackForTest } from '@/features/packs/registry'
import { makeApplication } from '@/test/applicationFixtures'
import { type BoardWorld, setupBoardWorld } from '@/test/boardFixtures'
import { makeTestDb, type TestDb } from '@/test/db'
import { decideUnderXx, HEARING_DATE } from '@/test/deliveryFixtures'
import { XX_VARIANCE_GATE } from '@/test/packs/xx/varianceGate'

interface MockState {
  db: unknown
  actor: Actor | null
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

const { linkRelianceAction, unlinkRelianceAction } = await import('./relianceActions')

let handle: TestDb
let world: BoardWorld

beforeAll(() => {
  setActivePackForTest(XX_VARIANCE_GATE)
})
afterAll(() => {
  setActivePackForTest(null)
})
beforeEach(async () => {
  handle = await makeTestDb()
  state.db = handle.db
  world = await setupBoardWorld(handle.db, {
    zbaMeetings: [HEARING_DATE],
    pack: XX_VARIANCE_GATE,
    classificationKey: 'xx.board_variance',
  })
})
afterEach(async () => {
  await handle.drop()
})

function form(fields: Record<string, string>): FormData {
  const f = new FormData()
  f.set('csrf_token', 'tok')
  for (const [k, v] of Object.entries(fields)) f.set(k, v)
  return f
}

describe('linkRelianceAction', () => {
  it('links the permit to the chosen variance', async () => {
    const made = await decideUnderXx(handle.db, world)
    const permit = await makeApplication(handle.db, world, { state: 'decided' })
    state.actor = world.staff
    const result = await linkRelianceAction(
      form({ applicationId: permit.applicationId, varianceApplicationId: made.applicationId }),
    )
    expect(result).toEqual({ ok: true, message: 'Variance linked.' })
    const rows = await handle.db
      .select()
      .from(relianceLinks)
      .where(eq(relianceLinks.planningApplicationId, permit.applicationId))
    expect(rows.map((r) => r.varianceApplicationId)).toEqual([made.applicationId])
  })

  it('refuses an application that is not a variance', async () => {
    const permit = await makeApplication(handle.db, world, { state: 'decided' })
    const other = await makeApplication(handle.db, world, { state: 'decided' })
    state.actor = world.staff
    const result = await linkRelianceAction(
      form({ applicationId: permit.applicationId, varianceApplicationId: other.applicationId }),
    )
    expect(result).toMatchObject({ ok: false, error: 'That record was not found.' })
  })
})

describe('unlinkRelianceAction', () => {
  it('removes the link from the permit', async () => {
    const made = await decideUnderXx(handle.db, world)
    const permit = await makeApplication(handle.db, world, { state: 'decided' })
    state.actor = world.staff
    const fields = {
      applicationId: permit.applicationId,
      varianceApplicationId: made.applicationId,
    }
    expect(await linkRelianceAction(form(fields))).toMatchObject({ ok: true })
    expect(await unlinkRelianceAction(form(fields))).toEqual({
      ok: true,
      message: 'Variance link removed.',
    })
    expect(await handle.db.select().from(relianceLinks)).toEqual([])
  })
})
