import { eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { appealNodes } from '@/db/schema'
import { recordAdministrativeDecision } from '@/features/appeals/adminAppeals'
import { makeApplication } from '@/test/applicationFixtures'
import { BOARD_FIXTURE_NOW, type BoardWorld, setupBoardWorld } from '@/test/boardFixtures'
import { makeTestDb, type TestDb } from '@/test/db'
import type { CivilDate } from '@/types/civilDate'

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

async function record(applicationNumber: string, on: string) {
  return await recordAdministrativeDecision(
    handle.db,
    world.staff,
    { applicationNumber, occurredOn: on as CivilDate, now: BOARD_FIXTURE_NOW },
    signal,
  )
}

async function nodesOf(applicationId: string) {
  return await handle.db
    .select()
    .from(appealNodes)
    .where(eq(appealNodes.applicationId, applicationId))
}

describe('checks on a recorded administrative decision', () => {
  it('refuses a board application such as a variance', async () => {
    const variance = await makeApplication(
      handle.db,
      world,
      { state: 'decided', receivedDate: '2027-02-01' },
      undefined,
      world.zbaTypeKey,
    )
    expect(await record(variance.number, '2027-03-01')).toEqual({
      ok: false,
      error: 'board_application',
    })
    expect(await nodesOf(variance.applicationId)).toEqual([])
  })

  it('refuses a decision dated before the application was received', async () => {
    const permit = await makeApplication(handle.db, world, {
      state: 'issued',
      receivedDate: '2027-02-10',
    })
    expect(await record(permit.number, '2027-02-09')).toEqual({
      ok: false,
      error: 'before_receipt',
    })
    expect(await nodesOf(permit.applicationId)).toEqual([])
    expect((await record(permit.number, '2027-02-10')).ok).toBe(true)
  })
})
