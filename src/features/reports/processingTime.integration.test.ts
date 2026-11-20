import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { setActivePackForTest } from '@/features/packs/registry'
import { processingTimeReport } from '@/features/reports/processingTime'
import { makeApplication, type PermitWorld, setupPermitWorld } from '@/test/applicationFixtures'
import { makeTestDb, type TestDb } from '@/test/db'
import { XX_NO_BUILDING } from '@/test/packs/xx/variants'
import type { CivilDate } from '@/types/civilDate'

const signal = new AbortController().signal
let handle: TestDb
let world: PermitWorld

beforeAll(async () => {
  handle = await makeTestDb()
  world = await setupPermitWorld(handle.db, { starters: ['nh.starter.building'] })
})
afterAll(async () => {
  setActivePackForTest(null)
  await handle.drop()
})

describe('processing time under a pack with no building permit', () => {
  it('reports an issued application with no decision clock figures', async () => {
    await makeApplication(
      handle.db,
      world,
      {
        receivedDate: '2027-09-01',
        completedDate: '2027-09-02',
        decidedOn: '2027-10-02',
        issuedOn: '2027-10-03',
      },
      new Date('2027-09-02T15:00:00Z'),
      'BP',
    )
    setActivePackForTest(XX_NO_BUILDING)
    const result = await processingTimeReport(
      handle.db,
      world.staff,
      { from: '2027-10-01' as CivilDate, to: '2027-10-31' as CivilDate },
      signal,
    )
    if (!result.ok) throw new Error(result.error)
    expect(result.value).toHaveLength(1)
    expect(result.value[0]).toMatchObject({
      issued: 1,
      medianCompleteToDecision: null,
      decidedOnTime: null,
      decidedLate: null,
    })
  })
})
