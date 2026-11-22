import { eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { boardMeetings } from '@/db/schema'
import { scheduleHearing } from '@/features/hearings/hearings'
import { noticeStatus } from '@/features/notices/noticeStatus'
import { referenceRequired } from '@/features/notices/proofMethods'
import { recordProof } from '@/features/notices/proofs'
import { loadPortalBoardRecord } from '@/features/portal/boardRecord'
import {
  type BoardWorld,
  boardIdOf,
  recordNoRegionalImpact,
  setupBoardWorld,
  submitBoardApplication,
} from '@/test/boardFixtures'
import { makeTestDb, type TestDb } from '@/test/db'
import { findIsoDates, findUuids } from '@/test/leaks'
import {
  issueListWithRecipients,
  METHOD_FOR_CHANNEL,
  proofDocument,
  recipient,
} from '@/test/noticeFixtures'
import type { CivilDate } from '@/types/civilDate'

const signal = new AbortController().signal
const NOW = new Date('2027-04-01T16:00:00Z')
let handle: TestDb
let world: BoardWorld

beforeEach(async () => {
  handle = await makeTestDb()
  world = await setupBoardWorld(handle.db, { zbaMeetings: ['2027-04-15'] })
})
afterEach(async () => {
  await handle.drop()
})

async function scheduledWithThreeOwners() {
  const applicationId = await submitBoardApplication(
    handle.db,
    world,
    world.zbaTypeKey,
    '2027-03-02',
  )
  await recordNoRegionalImpact(handle.db, world, applicationId, 'no')
  await issueListWithRecipients(handle.db, world, applicationId, [
    recipient(1),
    recipient(2),
    recipient(3),
  ])
  const [meeting] = await handle.db
    .select({ id: boardMeetings.id })
    .from(boardMeetings)
    .where(eq(boardMeetings.boardId, await boardIdOf(handle.db, 'zba')))
  const made = await scheduleHearing(
    handle.db,
    world.staff,
    { applicationId, meetingId: meeting?.id ?? '', kind: 'public_hearing' },
    signal,
  )
  if (!made.ok) throw new Error(JSON.stringify(made.error))
  const hearing = await handle.db.query.hearings.findFirst({
    where: (h, { eq: same }) => same(h.id, made.value.hearingId),
  })
  return { applicationId, setId: hearing?.noticeSetId ?? '' }
}

async function prove(applicationId: string, setId: string, channel: string, on: string) {
  const status = await noticeStatus(handle.db, setId, signal)
  const method = METHOD_FOR_CHANNEL[channel]
  if (method === undefined) throw new Error(`no method for ${channel}`)
  const proved = await recordProof(
    handle.db,
    world.staff,
    {
      itemIds: status.items.filter((i) => i.channel === channel).map((i) => i.itemId),
      method,
      reference: referenceRequired(method) ? 'RR-0001' : null,
      effectiveOn: on as CivilDate,
      documentId: await proofDocument(handle.db, world, applicationId),
    },
    signal,
    NOW,
  )
  if (!proved.ok) throw new Error(JSON.stringify(proved.error))
}

async function noticeOf(applicationId: string): Promise<string[]> {
  const record = await loadPortalBoardRecord(handle.db, world.applicant, applicationId, signal)
  if (!record.ok) throw new Error(record.error)
  return record.value.notice
}

describe('the applicant notice summary', () => {
  it('counts the owners mailed and gives the mailing, posting and publication dates', async () => {
    const { applicationId, setId } = await scheduledWithThreeOwners()
    await prove(applicationId, setId, 'verified_mail', '2027-03-29')
    await prove(applicationId, setId, 'bulletin_board', '2027-03-30')
    await prove(applicationId, setId, 'newspaper', '2027-03-31')
    const notice = await noticeOf(applicationId)
    expect(notice).toEqual([
      '3 owners mailed on March 29, 2027.',
      'Posted on March 30, 2027.',
      'Published in the newspaper on March 31, 2027.',
    ])
    const text = JSON.stringify(notice)
    expect(text).not.toMatch(/Recipient|Heron Lane|Ledger|bulletin board|RR-0001/)
    expect(findIsoDates(text)).toEqual([])
    expect(findUuids(text)).toEqual([])
  })

  it('says the newspaper notice is not published while it has no proof', async () => {
    const { applicationId, setId } = await scheduledWithThreeOwners()
    await prove(applicationId, setId, 'verified_mail', '2027-03-29')
    expect(await noticeOf(applicationId)).toEqual([
      '3 owners mailed on March 29, 2027.',
      'Newspaper notice: Not published.',
    ])
  })
})
