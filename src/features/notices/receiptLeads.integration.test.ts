import { and, eq } from 'drizzle-orm'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { clocks } from '@/db/schema'
import { noticeStatus } from '@/features/notices/noticeStatus'
import { recordProof } from '@/features/notices/proofs'
import { prepareReceiptNotices } from '@/features/notices/receiptNotices'
import { setActivePackForTest } from '@/features/packs/registry'
import { type BoardWorld, setupBoardWorld, submitBoardApplication } from '@/test/boardFixtures'
import { makeTestDb, type TestDb } from '@/test/db'
import { issueListWithRecipients, proofDocument, recipient } from '@/test/noticeFixtures'
import {
  XX_PB_SUBDIVISION_KEY,
  XX_RECEIPT_LEAD_KEY,
  XX_RECEIPT_MAIL_KEY,
  XX_SECOND_RECEIPT_LEAD_KEY,
  XX_TWO_RECEIPT_LEADS,
} from '@/test/packs/xx/variants'
import type { CivilDate } from '@/types/civilDate'

const signal = new AbortController().signal
const NOW = new Date('2027-04-10T16:00:00Z')
let handle: TestDb
let world: BoardWorld

beforeAll(() => {
  setActivePackForTest(XX_TWO_RECEIPT_LEADS)
})
afterAll(() => {
  setActivePackForTest(null)
})
beforeEach(async () => {
  handle = await makeTestDb()
  world = await setupBoardWorld(handle.db, {
    pack: XX_TWO_RECEIPT_LEADS,
    classificationKey: XX_PB_SUBDIVISION_KEY,
  })
})
afterEach(async () => {
  await handle.drop()
})

async function clockOf(applicationId: string, ruleKey: string) {
  const [clock] = await handle.db
    .select()
    .from(clocks)
    .where(and(eq(clocks.applicationId, applicationId), eq(clocks.ruleKey, ruleKey)))
  return clock
}

describe('a receipt set with two lead clocks', () => {
  it('meets only the lead whose items are all proved', async () => {
    const id = await submitBoardApplication(handle.db, world, world.zbaTypeKey, '2027-03-02')
    await issueListWithRecipients(handle.db, world, id, [
      recipient(1),
      recipient(2, ['municipal_clerk']),
    ])
    const prepared = await prepareReceiptNotices(
      handle.db,
      world.staff,
      { applicationId: id },
      signal,
    )
    if (!prepared.ok) throw new Error('prepare failed')
    const status = await noticeStatus(handle.db, prepared.value.noticeSetId, signal)
    const firstLead = status.items.filter((i) => i.requirementKey === XX_RECEIPT_MAIL_KEY)
    expect(firstLead).toHaveLength(2)
    expect(status.items).toHaveLength(3)
    const proved = await recordProof(
      handle.db,
      world.staff,
      {
        itemIds: firstLead.map((i) => i.itemId),
        method: 'certificate_of_mailing',
        reference: null,
        effectiveOn: '2027-03-08' as CivilDate,
        documentId: await proofDocument(handle.db, world, id),
      },
      signal,
      NOW,
    )
    expect(proved.ok).toBe(true)
    expect(await clockOf(id, XX_RECEIPT_LEAD_KEY)).toMatchObject({
      status: 'met',
      metOn: '2027-03-08',
    })
    expect((await clockOf(id, XX_SECOND_RECEIPT_LEAD_KEY))?.status).toBe('running')
  })
})
