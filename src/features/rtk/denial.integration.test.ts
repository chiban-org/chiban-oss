import { and, eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { auditLog, documents, documentVersions, files, rtkRequests } from '@/db/schema'
import type { Actor } from '@/features/auth/actor'
import { denyRequest } from '@/features/rtk/denial'
import { closeRequest, logRequest, rtkRequestView } from '@/features/rtk/requests'
import { recordFirstResponse } from '@/features/rtk/responses'
import { recordWithholding } from '@/features/rtk/withholdings'
import type { ObjectStore } from '@/features/storage/objectStore'
import { makeTestDb, type TestDb } from '@/test/db'
import { makeTestStore } from '@/test/objectStore'
import { seedParcelWorld, staffActor } from '@/test/parcels'
import { pdfText } from '@/test/pdfText'
import type { CivilDate } from '@/types/civilDate'

const signal = new AbortController().signal
const d = (s: string) => s as CivilDate
const NOW = new Date('2027-07-14T15:00:00Z')
let handle: TestDb
let store: ObjectStore
let custodian: Actor
let reviewer: Actor

beforeEach(async () => {
  handle = await makeTestDb()
  store = (await makeTestStore()).store
  await seedParcelWorld(handle.db)
  custodian = await staffActor(handle.db, 'records_custodian')
  reviewer = await staffActor(handle.db, 'reviewer')
})
afterEach(async () => {
  await handle.drop()
})

async function logged(): Promise<string> {
  const r = await logRequest(
    handle.db,
    custodian,
    {
      receivedOn: d('2027-07-02'),
      receivedVia: 'email',
      requesterName: 'Casey Brandt',
      description: 'Correspondence about the Mill Road culvert',
    },
    signal,
    NOW,
  )
  if (!r.ok) throw new Error(`log failed ${r.error}`)
  return r.value.requestId
}

async function withhold(requestId: string): Promise<void> {
  const r = await recordWithholding(
    handle.db,
    custodian,
    {
      requestId,
      scope: 'withheld_in_full',
      recordDescription: 'Email from the town attorney about the culvert contract',
      exemptionKey: 'nh.rtk.91a5.xii',
      explanation: 'The email is a confidential communication seeking legal advice from counsel.',
    },
    signal,
  )
  if (!r.ok) throw new Error(`withhold failed ${r.error}`)
}

async function timeStated(): Promise<string> {
  const requestId = await logged()
  const r = await recordFirstResponse(
    handle.db,
    store,
    custodian,
    {
      requestId,
      kind: 'time_statement',
      respondedOn: d('2027-07-07'),
      timeStatement: {
        statedDate: d('2027-07-30'),
        delayReason: 'The correspondence needs review by counsel.',
        costEstimate: [],
      },
    },
    signal,
    NOW,
  )
  if (!r.ok) throw new Error(`time statement failed ${r.error}`)
  return requestId
}

const deny = (actor: Actor, requestId: string, deniedOn: string) =>
  denyRequest(
    { db: handle.db, store, actor, signal, now: NOW },
    { requestId, deniedOn: d(deniedOn) },
  )

async function letterText(documentId: string): Promise<string> {
  const [version] = await handle.db
    .select()
    .from(documentVersions)
    .where(eq(documentVersions.documentId, documentId))
  const [file] = await handle.db
    .select()
    .from(files)
    .where(eq(files.sha256, version?.fileSha256 ?? ''))
  const stream = await store.getStream(file?.storageKey ?? '', signal)
  if (!stream.ok) throw new Error('bytes')
  const text = await pdfText(new Uint8Array(await new Response(stream.value).arrayBuffer()))
  return text.replace(/\n/g, ' ')
}

describe('denying a request after a time statement', () => {
  it('moves the request to responded, records the date, files the denial letter and audits it', async () => {
    const requestId = await timeStated()
    await withhold(requestId)
    const r = await deny(custodian, requestId, '2027-07-14')
    expect(r.ok).toBe(true)
    const [row] = await handle.db.select().from(rtkRequests).where(eq(rtkRequests.id, requestId))
    expect(row?.status).toBe('responded')
    expect(row?.deniedOn).toBe('2027-07-14')
    expect(row?.openDueOn).toBeNull()
    expect(row?.firstResponseKind).toBe('time_statement')
    expect(row?.statedDue?.due).toBe('2027-07-30')
    const letters = await handle.db
      .select()
      .from(documents)
      .where(and(eq(documents.recordKind, 'rtk_request'), eq(documents.recordId, requestId)))
    const denial = letters.find((l) => l.title === `Denial of request ${row?.number}`)
    expect(denial).toBeDefined()
    expect(r.ok && r.value.letterDocumentId).toBe(denial?.id)
    const text = await letterText(denial?.id ?? '')
    expect(text).toContain('The town cannot provide some or all of the records you requested.')
    expect(text).toContain('Email from the town attorney about the culvert contract')
    const audits = await handle.db
      .select()
      .from(auditLog)
      .where(and(eq(auditLog.entityId, requestId), eq(auditLog.action, 'rtk.denied')))
    expect(audits).toHaveLength(1)
    const view = await rtkRequestView(handle.db, custodian, requestId, d('2027-07-14'), signal)
    expect(view.ok && view.value.deniedOn).toBe('2027-07-14')
    expect(view.ok && view.value.current).toBeNull()
  })

  it('refuses a denial without a withheld record and leaves the request waiting', async () => {
    const requestId = await timeStated()
    expect(await deny(custodian, requestId, '2027-07-14')).toEqual({
      ok: false,
      error: 'withholding_required',
    })
    const [row] = await handle.db.select().from(rtkRequests).where(eq(rtkRequests.id, requestId))
    expect(row?.status).toBe('awaiting_decision')
    expect(row?.deniedOn).toBeNull()
  })

  it('refuses a date after today and a date before the time statement', async () => {
    const requestId = await timeStated()
    await withhold(requestId)
    expect(await deny(custodian, requestId, '2027-07-15')).toEqual({
      ok: false,
      error: 'future_date',
    })
    expect(await deny(custodian, requestId, '2027-07-06')).toEqual({
      ok: false,
      error: 'before_statement',
    })
    expect((await deny(custodian, requestId, '2027-07-07')).ok).toBe(true)
  })

  it('refuses an open request, a responded one and a closed one', async () => {
    const open = await logged()
    await withhold(open)
    expect(await deny(custodian, open, '2027-07-14')).toEqual({
      ok: false,
      error: 'not_awaiting_decision',
    })
    const responded = await timeStated()
    await withhold(responded)
    expect((await deny(custodian, responded, '2027-07-14')).ok).toBe(true)
    expect(await deny(custodian, responded, '2027-07-14')).toEqual({
      ok: false,
      error: 'not_awaiting_decision',
    })
    const closed = await timeStated()
    await withhold(closed)
    const [row] = await handle.db.select().from(rtkRequests).where(eq(rtkRequests.id, closed))
    await closeRequest(
      handle.db,
      custodian,
      { requestId: closed, to: 'closed', expectedRowVersion: row?.rowVersion ?? 0 },
      signal,
    )
    expect(await deny(custodian, closed, '2027-07-14')).toEqual({
      ok: false,
      error: 'not_awaiting_decision',
    })
  })

  it('refuses a reviewer and an unknown request', async () => {
    const requestId = await timeStated()
    await withhold(requestId)
    expect(await deny(reviewer, requestId, '2027-07-14')).toEqual({
      ok: false,
      error: 'forbidden',
    })
    expect(await deny(custodian, crypto.randomUUID(), '2027-07-14')).toEqual({
      ok: false,
      error: 'not_found',
    })
  })
})
