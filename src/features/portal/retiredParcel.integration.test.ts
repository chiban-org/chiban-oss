import { eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { applications, parcels } from '@/db/schema'
import { startApplication } from '@/features/portal/drafts'
import { type PermitWorld, setupPermitWorld } from '@/test/applicationFixtures'
import { makeTestDb, type TestDb } from '@/test/db'
import { staffActor } from '@/test/parcels'

const signal = new AbortController().signal
let handle: TestDb
let world: PermitWorld

beforeEach(async () => {
  handle = await makeTestDb()
  world = await setupPermitWorld(handle.db)
})
afterEach(async () => {
  await handle.drop()
})

describe('starting an application on a retired parcel', () => {
  it('is refused and creates no draft', async () => {
    await handle.db.update(parcels).set({ status: 'retired' }).where(eq(parcels.id, world.parcelId))
    const applicant = await staffActor(handle.db, 'applicant')
    const before = await handle.db.select().from(applications)
    const started = await startApplication(
      handle.db,
      applicant,
      { parcelId: world.parcelId, applicationTypeKey: 'BP' },
      signal,
    )
    expect(started).toEqual({ ok: false, error: 'retired_parcel' })
    expect(await handle.db.select().from(applications)).toHaveLength(before.length)
  })
})
