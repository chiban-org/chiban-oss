import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { setActivePackForTest } from '@/features/packs/registry'
import { type BoardWorld, setupBoardWorld } from '@/test/boardFixtures'
import { makeTestDb, type TestDb } from '@/test/db'
import { BOA_MEETINGS } from '@/test/maineBoardOfAppealsFixtures'
import {
  acceptAtMeeting,
  clocksOf,
  decideSubdivision,
  publishSubdivisionType,
  receivedSubdivision,
  scheduleSubdivisionHearing,
} from '@/test/maineSubdivisionFixtures'
import { ME_PACK } from './index'

let handle: TestDb
let world: BoardWorld

beforeEach(async () => {
  handle = await makeTestDb()
  world = await setupBoardWorld(handle.db, { zbaMeetings: BOA_MEETINGS })
  setActivePackForTest(ME_PACK)
  await publishSubdivisionType(handle.db, world)
})
afterEach(async () => {
  setActivePackForTest(null)
  await handle.drop()
})

async function hearingStatus(hearingId: string) {
  const rows = await handle.db.query.hearings.findMany({
    where: (h, { eq: same }) => same(h.id, hearingId),
  })
  return rows[0]?.status
}

describe('a Maine subdivision decided without its scheduled hearing', () => {
  it('records the decision, cancels the hearing and closes the hearing deadline', async () => {
    const id = await receivedSubdivision(handle.db, world, 'not_within')
    await acceptAtMeeting(handle.db, world, id)
    const hearing = await scheduleSubdivisionHearing(handle.db, world, id)
    expect(await clocksOf(handle.db, id, 'me.pb.hearing_window')).toMatchObject([
      { status: 'running' },
    ])
    expect((await decideSubdivision(handle.db, world, id, null)).ok).toBe(true)
    expect(await hearingStatus(hearing.hearingId)).toBe('cancelled')
    expect(await clocksOf(handle.db, id, 'me.pb.hearing_window')).toMatchObject([
      { status: 'superseded', supersededReason: 'decided_without_hearing', metOn: null },
    ])
  })
})
