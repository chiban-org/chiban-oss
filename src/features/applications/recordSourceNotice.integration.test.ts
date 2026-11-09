import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { boardDecisions } from '@/db/schema'
import { summarizeApplications } from '@/features/applications/recordSource'
import type { ObjectStore } from '@/features/storage/objectStore'
import { type BoardWorld, setupBoardWorld } from '@/test/boardFixtures'
import { makeTestDb, type TestDb } from '@/test/db'
import { decidedZba } from '@/test/hearingFixtures'
import { makeTestStore } from '@/test/objectStore'

const signal = new AbortController().signal
let handle: TestDb
let store: ObjectStore
let world: BoardWorld
let applicationId = ''
let decisionId = ''

beforeAll(async () => {
  handle = await makeTestDb()
  store = (await makeTestStore()).store
  world = await setupBoardWorld(handle.db, { zbaMeetings: ['2027-04-15'] })
  const decided = await decidedZba(handle.db, world, store, { documents: false })
  applicationId = decided.applicationId
  decisionId = decided.decisionId
})
afterAll(async () => {
  await handle.drop()
})

async function statusFor(viewer: Parameters<typeof summarizeApplications>[2]) {
  const [summary] = await summarizeApplications(handle.db, [applicationId], viewer, signal)
  return summary?.status
}

describe('a voted board decision on the parcel record', () => {
  it('reads "Decided, notice not yet filed" to the public until the notice is filed', async () => {
    expect(await statusFor({ kind: 'public' })).toEqual({
      label: 'Decided, notice not yet filed',
      chip: 'neutral',
    })
  })

  it('shows staff the outcome as soon as it is voted', async () => {
    expect(await statusFor({ kind: 'actor', actor: world.staff })).toEqual({
      label: 'Granted',
      chip: 'passed',
    })
  })

  it('shows the public the outcome once the notice is filed', async () => {
    await handle.db
      .update(boardDecisions)
      .set({ filedOn: '2027-04-16' })
      .where(eq(boardDecisions.id, decisionId))
    expect(await statusFor({ kind: 'public' })).toEqual({ label: 'Granted', chip: 'passed' })
  })
})
