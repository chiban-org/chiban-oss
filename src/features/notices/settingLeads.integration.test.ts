import { eq } from 'drizzle-orm'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { noticeItems } from '@/db/schema'
import { prepareReceiptNotices } from '@/features/notices/receiptNotices'
import { setActivePackForTest } from '@/features/packs/registry'
import { type BoardWorld, setupBoardWorld, submitBoardApplication } from '@/test/boardFixtures'
import { saveAndPublish } from '@/test/configFixtures'
import { makeTestDb, type TestDb } from '@/test/db'
import { issueListWithRecipients, recipient } from '@/test/noticeFixtures'
import {
  XX_RECEIPT_LEAD_SETTING_KEY,
  XX_TOWN_SET_RECEIPT_LEAD,
} from '@/test/packs/xx/settingVariants'
import { XX_PB_SUBDIVISION_KEY } from '@/test/packs/xx/variants'

const signal = new AbortController().signal
const RECEIVED = '2027-03-02'
let handle: TestDb
let world: BoardWorld

beforeAll(() => {
  setActivePackForTest(XX_TOWN_SET_RECEIPT_LEAD)
})
afterAll(() => {
  setActivePackForTest(null)
})
beforeEach(async () => {
  handle = await makeTestDb()
  world = await setupBoardWorld(handle.db, {
    pack: XX_TOWN_SET_RECEIPT_LEAD,
    classificationKey: XX_PB_SUBDIVISION_KEY,
  })
})
afterEach(async () => {
  await handle.drop()
})

async function publishDays(value: number) {
  await saveAndPublish(handle.db, world.admin, 'town_rule_setting', XX_RECEIPT_LEAD_SETTING_KEY, {
    ruleKey: XX_RECEIPT_LEAD_SETTING_KEY,
    value,
    adoptingAuthority: 'Select Board',
    adoptedOn: '2027-01-05',
  })
}

async function receiptDueDates(): Promise<string[]> {
  const id = await submitBoardApplication(handle.db, world, world.zbaTypeKey, RECEIVED)
  await issueListWithRecipients(handle.db, world, id, [recipient(1), recipient(2)])
  const prepared = await prepareReceiptNotices(
    handle.db,
    world.staff,
    { applicationId: id },
    signal,
  )
  if (!prepared.ok) throw new Error('prepare failed')
  const items = await handle.db
    .select()
    .from(noticeItems)
    .where(eq(noticeItems.setId, prepared.value.noticeSetId))
  return [...new Set(items.map((i) => i.dueOn))]
}

describe('a receipt notice lead set by the town', () => {
  it('follows the setting default when nothing is published', async () => {
    expect(await receiptDueDates()).toEqual(['2027-03-07'])
  })

  it('follows the published value', async () => {
    await publishDays(25)
    expect(await receiptDueDates()).toEqual(['2027-03-27'])
  })
})
