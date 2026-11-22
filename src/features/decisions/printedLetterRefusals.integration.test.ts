import { eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { hearings } from '@/db/schema'
import { writeAudit } from '@/features/audit/writeAudit'
import { fileDecision } from '@/features/decisions/fileDecision'
import { LETTER_PRINTED_ACTION } from '@/features/documents/evidence'
import { noticeStatus } from '@/features/notices/noticeStatus'
import { recordProof } from '@/features/notices/proofs'
import type { ObjectStore } from '@/features/storage/objectStore'
import { type BoardWorld, setupBoardWorld } from '@/test/boardFixtures'
import { makeTestDb, type TestDb } from '@/test/db'
import { pdfBytes, uploadAs } from '@/test/documentFixtures'
import { decidedZba } from '@/test/hearingFixtures'
import { makeTestStore } from '@/test/objectStore'
import type { CivilDate } from '@/types/civilDate'

const signal = new AbortController().signal
const AFTER_FILING = new Date('2027-07-20T16:00:00Z')
let handle: TestDb
let world: BoardWorld
let store: ObjectStore

beforeEach(async () => {
  handle = await makeTestDb()
  world = await setupBoardWorld(handle.db, { zbaMeetings: ['2027-04-15'] })
  store = (await makeTestStore()).store
})
afterEach(async () => {
  await handle.drop()
})

async function printedLetterOn(applicationId: string): Promise<string> {
  const { documentId } = await uploadAs(
    handle.db,
    store,
    world.staff,
    { kind: 'application', id: applicationId },
    pdfBytes('Letter to the abutters'),
    { title: 'Letter to the abutters' },
  )
  await writeAudit(
    handle.db,
    {
      actor: { kind: 'user', userId: world.staff.userId },
      action: LETTER_PRINTED_ACTION,
      entityType: 'document',
      entityId: documentId,
      after: { applicationId, templateKey: 'abutter-letter' },
    },
    signal,
  )
  return documentId
}

describe('a printed letter refused by the server', () => {
  it('cannot be filed as the minutes of a decision', async () => {
    const made = await decidedZba(handle.db, world, store, { votedOn: '2027-07-01' })
    const result = await fileDecision(
      handle.db,
      world.staff,
      {
        decisionId: made.decisionId,
        filedOn: '2027-07-09' as CivilDate,
        minutesDocumentId: await printedLetterOn(made.applicationId),
      },
      signal,
      AFTER_FILING,
    )
    expect(result).toEqual({ ok: false, error: 'wrong_document' })
  })

  it('cannot be recorded as proof of notice', async () => {
    const made = await decidedZba(handle.db, world, store, { votedOn: '2027-07-01' })
    const [hearing] = await handle.db.select().from(hearings).where(eq(hearings.id, made.hearingId))
    const status = await noticeStatus(handle.db, hearing?.noticeSetId ?? '', signal)
    const result = await recordProof(
      handle.db,
      world.staff,
      {
        itemIds: status.items.slice(0, 1).map((i) => i.itemId),
        method: 'certificate_of_mailing',
        reference: null,
        effectiveOn: '2027-03-30' as CivilDate,
        documentId: await printedLetterOn(made.applicationId),
      },
      signal,
      AFTER_FILING,
    )
    expect(result).toEqual({ ok: false, error: 'wrong_document' })
  })

  it('the same upload without the printed mark is accepted as the minutes', async () => {
    const made = await decidedZba(handle.db, world, store, { votedOn: '2027-07-01' })
    const { documentId } = await uploadAs(
      handle.db,
      store,
      world.staff,
      { kind: 'application', id: made.applicationId },
      pdfBytes('Minutes of the July meeting'),
      { title: 'Minutes' },
    )
    const result = await fileDecision(
      handle.db,
      world.staff,
      {
        decisionId: made.decisionId,
        filedOn: '2027-07-09' as CivilDate,
        minutesDocumentId: documentId,
      },
      signal,
      AFTER_FILING,
    )
    expect(result.ok).toBe(true)
  })
})
