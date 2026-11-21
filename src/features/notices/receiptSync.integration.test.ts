import { and, eq } from 'drizzle-orm'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { clocks, noticeItems, remediationTasks } from '@/db/schema'
import { STALE_LIST_TASK_KIND } from '@/features/abutters/staleList'
import { setApplicationMunicipalities } from '@/features/boards/applicationMunicipalities'
import { recordProof } from '@/features/notices/proofs'
import { prepareReceiptNotices } from '@/features/notices/receiptNotices'
import { setActivePackForTest } from '@/features/packs/registry'
import {
  type BoardWorld,
  publishRegionalContacts,
  setupBoardWorld,
  submitBoardApplication,
} from '@/test/boardFixtures'
import { makeTestDb, type TestDb } from '@/test/db'
import { issueListWithRecipients, proofDocument, recipient } from '@/test/noticeFixtures'
import {
  XX_PB_SUBDIVISION_KEY,
  XX_RECEIPT_LEAD_KEY,
  XX_RECEIPT_NOTICES,
} from '@/test/packs/xx/variants'
import type { CivilDate } from '@/types/civilDate'

const signal = new AbortController().signal
const d = (s: string) => s as CivilDate
const NOW = new Date('2027-04-10T16:00:00Z')
let handle: TestDb
let world: BoardWorld

beforeAll(() => {
  setActivePackForTest(XX_RECEIPT_NOTICES)
})
afterAll(() => {
  setActivePackForTest(null)
})
beforeEach(async () => {
  handle = await makeTestDb()
  world = await setupBoardWorld(handle.db, {
    pack: XX_RECEIPT_NOTICES,
    classificationKey: XX_PB_SUBDIVISION_KEY,
  })
})
afterEach(async () => {
  await handle.drop()
})

async function receivedApplication(): Promise<string> {
  const id = await submitBoardApplication(handle.db, world, world.zbaTypeKey, '2027-03-02')
  await issueListWithRecipients(handle.db, world, id, [
    recipient(1),
    recipient(2, ['municipal_clerk']),
  ])
  return id
}

async function preparedSet(applicationId: string): Promise<string> {
  const result = await prepareReceiptNotices(handle.db, world.staff, { applicationId }, signal)
  if (!result.ok) throw new Error(`prepare failed: ${JSON.stringify(result.error)}`)
  return result.value.noticeSetId
}

async function prove(applicationId: string, itemId: string, effectiveOn: string) {
  const proved = await recordProof(
    handle.db,
    world.staff,
    {
      itemIds: [itemId],
      method: 'certificate_of_mailing',
      reference: null,
      effectiveOn: d(effectiveOn),
      documentId: await proofDocument(handle.db, world, applicationId),
    },
    signal,
    NOW,
  )
  if (!proved.ok) throw new Error(`proof failed: ${JSON.stringify(proved.error)}`)
}

async function itemIdsOf(setId: string): Promise<string[]> {
  const rows = await handle.db
    .select({ id: noticeItems.id })
    .from(noticeItems)
    .where(eq(noticeItems.setId, setId))
  return rows.map((r) => r.id)
}

async function leadClock(applicationId: string) {
  const [clock] = await handle.db
    .select()
    .from(clocks)
    .where(and(eq(clocks.applicationId, applicationId), eq(clocks.ruleKey, XX_RECEIPT_LEAD_KEY)))
  return clock
}

describe('the receipt lead clock', () => {
  it('is met once items proved one at a time are all proved', async () => {
    const id = await receivedApplication()
    const [first, second] = await itemIdsOf(await preparedSet(id))
    await prove(id, first ?? '', '2027-03-05')
    expect((await leadClock(id))?.status).toBe('running')
    await prove(id, second ?? '', '2027-03-06')
    expect(await leadClock(id)).toMatchObject({ status: 'met', metOn: '2027-03-06' })
  })

  it('moves its met date when a proof is superseded by one with a later date', async () => {
    const id = await receivedApplication()
    const [first, second] = await itemIdsOf(await preparedSet(id))
    await prove(id, first ?? '', '2027-03-05')
    await prove(id, second ?? '', '2027-03-05')
    expect(await leadClock(id)).toMatchObject({ status: 'met', metOn: '2027-03-05' })
    await prove(id, second ?? '', '2027-03-08')
    expect(await leadClock(id)).toMatchObject({ status: 'met', metOn: '2027-03-08' })
  })
})

describe('receipt notices after the municipalities change', () => {
  it('marks the issued list for regeneration and refuses to prepare from it', async () => {
    await publishRegionalContacts(handle.db, world)
    const id = await receivedApplication()
    const set = await setApplicationMunicipalities(
      handle.db,
      world.staff,
      { applicationId: id, municipalities: [{ key: 'pine_river', relation: 'abutting' }] },
      signal,
    )
    expect(set.ok).toBe(true)
    const tasks = await handle.db
      .select()
      .from(remediationTasks)
      .where(
        and(
          eq(remediationTasks.applicationId, id),
          eq(remediationTasks.kind, STALE_LIST_TASK_KIND),
        ),
      )
    expect(tasks).toHaveLength(1)
    expect(
      await prepareReceiptNotices(handle.db, world.staff, { applicationId: id }, signal),
    ).toEqual({ ok: false, error: 'list_out_of_date' })
  })
})
