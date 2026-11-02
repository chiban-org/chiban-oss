import { eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { clocks } from '@/db/schema'
import { startClocksFor } from '@/features/clocks/startClocks'
import { makeApplication } from '@/test/applicationFixtures'
import { type BoardWorld, recordNoRegionalImpact, setupBoardWorld } from '@/test/boardFixtures'
import { makeTestDb, type TestDb } from '@/test/db'
import type { CivilDate } from '@/types/civilDate'

const signal = new AbortController().signal
const d = (s: string) => s as CivilDate
let handle: TestDb
let world: BoardWorld

beforeEach(async () => {
  handle = await makeTestDb()
  world = await setupBoardWorld(handle.db)
})
afterEach(async () => {
  await handle.drop()
})

async function dueByRule(applicationId: string) {
  const rows = await handle.db.select().from(clocks).where(eq(clocks.applicationId, applicationId))
  return Object.fromEntries(rows.map((c) => [c.ruleKey, c]))
}

async function zbaApplication() {
  const app = await makeApplication(handle.db, world, {}, undefined, world.zbaTypeKey)
  await recordNoRegionalImpact(handle.db, world, app.applicationId)
  return app.applicationId
}

describe('board vote clocks', () => {
  it('a zba approval voted 2027-04-15 starts filing due 2027-04-22 and rehearing due 2027-05-17', async () => {
    const id = await zbaApplication()
    await handle.db.transaction((tx) =>
      startClocksFor(tx, id, 'board_vote', d('2027-04-15'), signal, undefined, undefined, {
        outcome: 'approved',
      }),
    )
    const due = await dueByRule(id)
    expect(due['nh.board.decision_filing']?.currentDue).toBe('2027-04-22')
    expect(due['nh.appeal.zba_rehearing']).toMatchObject({
      currentDue: '2027-05-17',
      rolledFrom: '2027-05-15',
    })
    expect(due['nh.ri.transmittal']).toBeUndefined()
  })

  it('a zba denial starts the rehearing window and a rehearing outcome does not', async () => {
    const id = await zbaApplication()
    await handle.db.transaction((tx) =>
      startClocksFor(tx, id, 'board_vote', d('2027-04-15'), signal, undefined, undefined, {
        outcome: 'rehearing_denied',
      }),
    )
    expect((await dueByRule(id))['nh.appeal.zba_rehearing']).toBeUndefined()
  })

  it('an amendment window starts only for a late filing', async () => {
    const id = await zbaApplication()
    await handle.db.transaction((tx) =>
      startClocksFor(tx, id, 'decision_filed', d('2027-07-12'), signal, undefined, undefined, {
        decisionFiledLate: false,
      }),
    )
    expect((await dueByRule(id))['nh.appeal.amendment_window']).toBeUndefined()
    await handle.db.transaction((tx) =>
      startClocksFor(tx, id, 'decision_filed', d('2027-07-12'), signal, undefined, undefined, {
        decisionFiledLate: true,
      }),
    )
    expect((await dueByRule(id))['nh.appeal.amendment_window']?.currentDue).toBe('2027-08-11')
  })
})
