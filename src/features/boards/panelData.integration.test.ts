import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { loadBoardPanel } from '@/features/boards/panelData'
import { type BoardWorld, setupBoardWorld, submitBoardApplication } from '@/test/boardFixtures'
import { makeTestDb, type TestDb } from '@/test/db'

const signal = new AbortController().signal
let handle: TestDb
let world: BoardWorld

beforeEach(async () => {
  handle = await makeTestDb()
  world = await setupBoardWorld(handle.db)
})
afterEach(async () => {
  await handle.drop()
})

describe('loadBoardPanel', () => {
  it('staff with full record access get the panel', async () => {
    const id = await submitBoardApplication(handle.db, world, world.pbTypeKey, '2027-03-24')
    expect(await loadBoardPanel(handle.db, world.staff, id, signal)).toMatchObject({
      applicationId: id,
    })
  })

  it('a reviewer gets nothing', async () => {
    const id = await submitBoardApplication(handle.db, world, world.pbTypeKey, '2027-03-24')
    expect(await loadBoardPanel(handle.db, world.reviewer, id, signal)).toBeNull()
  })

  it('the applicant gets nothing', async () => {
    const id = await submitBoardApplication(handle.db, world, world.pbTypeKey, '2027-03-24')
    expect(await loadBoardPanel(handle.db, world.applicant, id, signal)).toBeNull()
  })
})
