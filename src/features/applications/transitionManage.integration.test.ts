import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { applications } from '@/db/schema'
import { loadApplicationContext } from '@/features/applications/context'
import { actorMayMove, transitionApplication } from '@/features/applications/transition'
import type { Actor } from '@/features/auth/actor'
import { makeApplication, type PermitWorld, setupPermitWorld } from '@/test/applicationFixtures'
import { makeTestDb, type TestDb } from '@/test/db'
import { staffActor } from '@/test/parcels'
import type { CivilDate } from '@/types/civilDate'

const signal = new AbortController().signal
const ON = '2027-03-10' as CivilDate
let handle: TestDb
let world: PermitWorld

beforeAll(async () => {
  handle = await makeTestDb()
  world = await setupPermitWorld(handle.db)
})
afterAll(async () => {
  await handle.drop()
})

async function moveToReview(actor: Actor, applicationId: string) {
  const [row] = await handle.db
    .select()
    .from(applications)
    .where(eq(applications.id, applicationId))
  return await handle.db.transaction((tx) =>
    transitionApplication(
      tx,
      actor,
      { applicationId, to: 'under_review', expectedRowVersion: row?.rowVersion ?? 0, onDate: ON },
      signal,
    ),
  )
}

async function offered(actor: Actor, applicationId: string): Promise<boolean> {
  const app = await loadApplicationContext(handle.db, applicationId, signal)
  if (app === null) throw new Error('application missing')
  return await actorMayMove(handle.db, actor, app, 'under_review', signal)
}

describe('workflow moves need application.manage', () => {
  it('refuses inspectors, finance and records custodians and does not offer them the move', async () => {
    for (const role of ['inspector', 'finance', 'records_custodian'] as const) {
      const actor = await staffActor(handle.db, role)
      const app = await makeApplication(handle.db, world, { state: 'submitted' })
      expect(await offered(actor, app.applicationId)).toBe(false)
      expect(await moveToReview(actor, app.applicationId)).toEqual({
        ok: false,
        error: 'forbidden',
      })
    }
  })

  it('lets staff and admin move a submitted application under review', async () => {
    for (const actor of [world.staff, world.admin]) {
      const app = await makeApplication(handle.db, world, { state: 'submitted' })
      expect(await offered(actor, app.applicationId)).toBe(true)
      expect(await moveToReview(actor, app.applicationId)).toMatchObject({
        ok: true,
        value: { state: 'under_review' },
      })
    }
  })
})
