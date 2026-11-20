import { eq } from 'drizzle-orm'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { decisionDeliveries } from '@/db/schema'
import { setActivePackForTest } from '@/features/packs/registry'
import { type BoardWorld, setupBoardWorld } from '@/test/boardFixtures'
import { makeTestDb, type TestDb } from '@/test/db'
import {
  decideUnderXx,
  deliver,
  deliveriesOf,
  deliveryPack,
  deliveryRule,
  FULL_PACK,
  HEARING_DATE,
} from '@/test/deliveryFixtures'
import { actorOf, revoke } from '@/test/staffUsers'

let handle: TestDb
let world: BoardWorld
let firstId: string
let applicationId: string

beforeAll(() => {
  setActivePackForTest(FULL_PACK)
})
afterAll(() => {
  setActivePackForTest(null)
})
beforeEach(async () => {
  handle = await makeTestDb()
  world = await setupBoardWorld(handle.db, {
    zbaMeetings: [HEARING_DATE],
    pack: FULL_PACK,
    classificationKey: 'xx.board_variance',
  })
  const made = await decideUnderXx(handle.db, world)
  applicationId = made.applicationId
  firstId = (await deliveriesOf(handle.db, applicationId))[0]?.id ?? ''
})
afterEach(async () => {
  await handle.drop()
})

describe('recording a delivery refuses', () => {
  it('someone without the board record capability', async () => {
    await revoke(handle.db, 'staff', 'board.record')
    const actor = await actorOf(handle.db, world.staff.userId)
    expect(await deliver(handle.db, actor, firstId, '2027-04-17')).toEqual({
      ok: false,
      error: 'forbidden',
    })
  })

  it('a delivery that does not exist', async () => {
    const result = await deliver(
      handle.db,
      world.staff,
      '00000000-0000-4000-8000-000000000000',
      '2027-04-17',
    )
    expect(result).toEqual({ ok: false, error: 'not_found' })
  })

  it('a second record for the same recipient, keeping the first', async () => {
    await deliver(handle.db, world.staff, firstId, '2027-04-17')
    expect(await deliver(handle.db, world.staff, firstId, '2027-04-18', 'hand')).toEqual({
      ok: false,
      error: 'already_recorded',
    })
    const [stored] = await handle.db
      .select()
      .from(decisionDeliveries)
      .where(eq(decisionDeliveries.id, firstId))
    expect(stored).toMatchObject({ method: 'mail', deliveredOn: '2027-04-17' })
  })

  it('a date after today', async () => {
    expect(await deliver(handle.db, world.staff, firstId, '2027-06-02')).toEqual({
      ok: false,
      error: 'future_date',
    })
  })

  it('a date before the vote', async () => {
    expect(await deliver(handle.db, world.staff, firstId, '2027-04-14')).toEqual({
      ok: false,
      error: 'before_vote',
    })
  })

  it('a method the rule does not list', async () => {
    setActivePackForTest(deliveryPack({ ...deliveryRule, methods: ['mail'] }))
    try {
      expect(await deliver(handle.db, world.staff, firstId, '2027-04-17', 'hand')).toEqual({
        ok: false,
        error: 'method_not_allowed',
      })
    } finally {
      setActivePackForTest(FULL_PACK)
    }
  })
})
