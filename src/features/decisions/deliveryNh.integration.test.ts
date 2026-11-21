import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { decisionDeliveries } from '@/db/schema'
import { type BoardWorld, setupBoardWorld } from '@/test/boardFixtures'
import { makeTestDb, type TestDb } from '@/test/db'
import { decidedZba } from '@/test/hearingFixtures'
import { makeTestStore } from '@/test/objectStore'

let handle: TestDb
let world: BoardWorld

beforeEach(async () => {
  handle = await makeTestDb()
  world = await setupBoardWorld(handle.db, { zbaMeetings: ['2027-04-15'] })
})
afterEach(async () => {
  await handle.drop()
})

describe('delivery under the NH pack', () => {
  it('plans no delivery rows for a decision', async () => {
    const { store } = await makeTestStore()
    const made = await decidedZba(handle.db, world, store, { documents: false })
    expect(made.decisionId).not.toBe('')
    expect(await handle.db.select().from(decisionDeliveries)).toEqual([])
  })
})
