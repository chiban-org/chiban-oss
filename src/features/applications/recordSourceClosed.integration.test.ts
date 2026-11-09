import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { applications } from '@/db/schema'
import { summarizeApplications } from '@/features/applications/recordSource'
import { makeApplication, type PermitWorld, setupPermitWorld } from '@/test/applicationFixtures'
import { makeTestDb, type TestDb } from '@/test/db'

const signal = new AbortController().signal
let handle: TestDb
let world: PermitWorld

beforeAll(async () => {
  handle = await makeTestDb()
  world = await setupPermitWorld(handle.db)
})
afterAll(async () => {
  await handle.drop()
})

async function closedFlagFor(state: string): Promise<boolean | undefined> {
  const app = await makeApplication(handle.db, world)
  await handle.db.update(applications).set({ state }).where(eq(applications.id, app.applicationId))
  const [summary] = await summarizeApplications(
    handle.db,
    [app.applicationId],
    { kind: 'actor', actor: world.staff },
    signal,
  )
  return summary?.closed
}

describe('application parcel record closed flag', () => {
  it('is set for expired, closed, denied and withdrawn permits', async () => {
    for (const state of ['expired', 'closed', 'denied', 'withdrawn']) {
      expect(await closedFlagFor(state)).toBe(true)
    }
  })

  it('is not set for permits in progress or in force', async () => {
    for (const state of ['submitted', 'under_review', 'decided', 'issued', 'suspended']) {
      expect(await closedFlagFor(state)).toBe(false)
    }
  })
})
