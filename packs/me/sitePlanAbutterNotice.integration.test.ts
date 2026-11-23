import { ME_PACK } from '@packs/me'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { setActivePackForTest } from '@/features/packs/registry'
import { type BoardWorld, setupBoardWorld } from '@/test/boardFixtures'
import { makeTestDb, type TestDb } from '@/test/db'
import {
  acceptAtMeeting,
  itemsOf,
  publishSubdivisionType,
  receivedSitePlan,
  scheduleSubdivisionHearing,
} from '@/test/maineSubdivisionFixtures'

let handle: TestDb
let world: BoardWorld

beforeEach(async () => {
  handle = await makeTestDb()
  world = await setupBoardWorld(handle.db)
  setActivePackForTest(ME_PACK)
  await publishSubdivisionType(handle.db, world)
})
afterEach(async () => {
  setActivePackForTest(null)
  await handle.drop()
})

describe('the Maine site plan hearing notice to abutters', () => {
  it('mails each abutter on the issued list before the hearing', async () => {
    const id = await receivedSitePlan(handle.db, world)
    await acceptAtMeeting(handle.db, world, id)
    const hearing = await scheduleSubdivisionHearing(handle.db, world, id)
    const items = await itemsOf(handle.db, hearing.noticeSetId)
    const abutters = items.filter((i) => i.requirementKey === 'town.sp.notice.abutters')
    expect(abutters.map((i) => [i.recipientName, i.channel, i.dueOn])).toEqual([
      ['Recipient 1', 'first_class_mail', '2027-04-07'],
    ])
  })

  it('is a town rule that leads from the site plan hearing notice', () => {
    const rule = ME_PACK.manifest.rules.find((r) => r.key === 'town.sp.notice.abutters')
    expect(rule).toMatchObject({
      kind: 'notice_requirement',
      label: 'Site plan hearing notice to abutters',
      citation: { label: 'Town rule', url: null },
      recipients: { roles: ['abutter_owner'] },
      leadRuleKey: 'town.sp.hearing_notice',
      stage: 'before_hearing',
    })
  })
})
