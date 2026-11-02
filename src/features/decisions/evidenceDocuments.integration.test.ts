import { and, eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { boardDecisions, documents, hearings } from '@/db/schema'
import { loadDecisionView } from '@/features/decisions/decisionView'
import { fileDecision } from '@/features/decisions/fileDecision'
import { noticeStatus } from '@/features/notices/noticeStatus'
import { recordProof } from '@/features/notices/proofs'
import type { ObjectStore } from '@/features/storage/objectStore'
import { type BoardWorld, setupBoardWorld } from '@/test/boardFixtures'
import { makeTestDb, type TestDb } from '@/test/db'
import { decidedZba } from '@/test/hearingFixtures'
import { makeTestStore } from '@/test/minio'
import { downloadObject } from '@/test/objectBytes'
import { pdfText } from '@/test/pdfText'
import type { CivilDate } from '@/types/civilDate'

const signal = new AbortController().signal
const d = (s: string) => s as CivilDate
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

async function snapshotOf(applicationId: string): Promise<string> {
  const [row] = await handle.db
    .select({ id: documents.id })
    .from(documents)
    .where(
      and(eq(documents.recordId, applicationId), eq(documents.docKind, 'application_snapshot')),
    )
  if (row === undefined) throw new Error('no snapshot')
  return row.id
}

describe('documents filed as minutes or proof', () => {
  it('the application snapshot cannot be filed as the minutes', async () => {
    const made = await decidedZba(handle.db, world, store, { votedOn: '2027-07-01' })
    const result = await fileDecision(
      handle.db,
      world.staff,
      {
        decisionId: made.decisionId,
        filedOn: d('2027-07-09'),
        minutesDocumentId: await snapshotOf(made.applicationId),
      },
      signal,
      AFTER_FILING,
    )
    expect(result).toEqual({ ok: false, error: 'wrong_document' })
  })

  it('the written decision cannot be filed as its own minutes', async () => {
    const made = await decidedZba(handle.db, world, store, { votedOn: '2027-07-01' })
    const [decision] = await handle.db
      .select()
      .from(boardDecisions)
      .where(eq(boardDecisions.id, made.decisionId))
    const result = await fileDecision(
      handle.db,
      world.staff,
      {
        decisionId: made.decisionId,
        filedOn: d('2027-07-09'),
        minutesDocumentId: decision?.writtenDecisionDocumentId ?? '',
      },
      signal,
      AFTER_FILING,
    )
    expect(result).toEqual({ ok: false, error: 'wrong_document' })
  })

  it('the application snapshot is not accepted as proof of notice', async () => {
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
        effectiveOn: d('2027-03-30'),
        documentId: await snapshotOf(made.applicationId),
      },
      signal,
      AFTER_FILING,
    )
    expect(result).toEqual({ ok: false, error: 'wrong_document' })
  })
})

describe('documents for an approval', () => {
  it('the notice of decision leaves out reasons for disapproval and empty conditions', async () => {
    const made = await decidedZba(handle.db, world, store, { votedOn: '2027-07-01' })
    const [decision] = await handle.db
      .select()
      .from(boardDecisions)
      .where(eq(boardDecisions.id, made.decisionId))
    const text = await pdfText(
      await downloadObject(handle.db, store, decision?.writtenDecisionDocumentId ?? ''),
    )
    expect(text).toContain('Approved')
    expect(text).not.toContain('Reasons for disapproval')
    expect(text).not.toContain('Conditions:')
  })
})

describe('the decision page for an approval', () => {
  it('a blank reasons field shows no reasons for disapproval', async () => {
    const made = await decidedZba(handle.db, world, store, {
      votedOn: '2027-07-01',
      documents: false,
    })
    await handle.db
      .update(boardDecisions)
      .set({ reasonsForDisapproval: '' })
      .where(eq(boardDecisions.id, made.decisionId))
    const view = await loadDecisionView(handle.db, world.staff, made.decisionId, signal)
    expect(view?.reasons).toBeNull()
  })
})
