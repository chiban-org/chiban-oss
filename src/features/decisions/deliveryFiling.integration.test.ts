import { eq } from 'drizzle-orm'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { clocks } from '@/db/schema'
import { fileDecision } from '@/features/decisions/fileDecision'
import { setActivePackForTest } from '@/features/packs/registry'
import { type BoardWorld, setupBoardWorld } from '@/test/boardFixtures'
import { makeTestDb, type TestDb } from '@/test/db'
import {
  decideUnderXx,
  deliver,
  deliveriesOf,
  dueClockOf,
  FILING_PACK,
  HEARING_DATE,
  readyToFile,
} from '@/test/deliveryFixtures'
import type { CivilDate } from '@/types/civilDate'

const signal = new AbortController().signal
const d = (s: string) => s as CivilDate
const AFTER = new Date('2027-06-01T16:00:00Z')
let handle: TestDb
let world: BoardWorld

beforeAll(() => {
  setActivePackForTest(FILING_PACK)
})
afterAll(() => {
  setActivePackForTest(null)
})
beforeEach(async () => {
  handle = await makeTestDb()
  world = await setupBoardWorld(handle.db, {
    zbaMeetings: [HEARING_DATE],
    pack: FILING_PACK,
    classificationKey: 'xx.board_variance',
  })
})
afterEach(async () => {
  await handle.drop()
})

async function file(made: { decisionId: string }, minutesId: string, filedOn: string) {
  return await fileDecision(
    handle.db,
    world.staff,
    { decisionId: made.decisionId, filedOn: d(filedOn), minutesDocumentId: minutesId },
    signal,
    AFTER,
  )
}

describe('filing a decision whose pack gives the filing clock its own length', () => {
  it.each([
    ['on the due Monday, a Sunday rolled forward', '2027-04-19', false],
    ['on the day after the due Monday', '2027-04-20', true],
  ])('with no clock row, takes the length from the rule and files %s', async (_, filedOn, late) => {
    const made = await decideUnderXx(handle.db, world)
    const { minutesId } = await readyToFile(handle.db, made)
    await handle.db.delete(clocks).where(eq(clocks.applicationId, made.applicationId))
    expect(await file(made, minutesId, filedOn)).toEqual({ ok: true, value: { late } })
  })
})

describe('filing a decision with recorded deliveries', () => {
  it('leaves every delivery row and the delivery clock as they were', async () => {
    const made = await decideUnderXx(handle.db, world)
    const { minutesId } = await readyToFile(handle.db, made)
    const [first] = await deliveriesOf(handle.db, made.applicationId)
    await deliver(handle.db, world.staff, first?.id ?? '', '2027-04-17')
    const before = await deliveriesOf(handle.db, made.applicationId)
    expect((await file(made, minutesId, '2027-04-20')).ok).toBe(true)
    expect(await deliveriesOf(handle.db, made.applicationId)).toEqual(before)
    expect((await dueClockOf(handle.db, made.applicationId))?.status).toBe('running')
  })
})
