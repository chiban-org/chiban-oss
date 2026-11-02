import { and, eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { documents, documentVersions, files, rtkRequests, rtkWithholdings } from '@/db/schema'
import type { Actor } from '@/features/auth/actor'
import { documentVisibleTo } from '@/features/documents/visibility'
import { listRtkRequests, logRequest, rtkRequestView } from '@/features/rtk/requests'
import { recordFirstResponse as recordAt } from '@/features/rtk/responses'
import { recordWithholding } from '@/features/rtk/withholdings'
import type { ObjectStore } from '@/features/storage/objectStore'
import { makeTestDb, type TestDb } from '@/test/db'
import { makeTestStore } from '@/test/minio'
import { seedParcelWorld, staffActor } from '@/test/parcels'
import { pdfText } from '@/test/pdfText'
import type { CivilDate } from '@/types/civilDate'

const signal = new AbortController().signal
const d = (s: string) => s as CivilDate
const NOW = new Date('2027-07-14T15:00:00Z')
let handle: TestDb

const recordFirstResponse = (
  db: Parameters<typeof recordAt>[0],
  st: ObjectStore,
  actor: Actor,
  input: Parameters<typeof recordAt>[3],
  sig: AbortSignal,
) => recordAt(db, st, actor, input, sig, NOW)
let store: ObjectStore
let staff: Actor
let custodian: Actor
let reviewer: Actor
let applicant: Actor

beforeEach(async () => {
  handle = await makeTestDb()
  store = (await makeTestStore()).store
  await seedParcelWorld(handle.db)
  staff = await staffActor(handle.db, 'staff')
  custodian = await staffActor(handle.db, 'records_custodian')
  reviewer = await staffActor(handle.db, 'reviewer')
  applicant = await staffActor(handle.db, 'applicant')
})
afterEach(async () => {
  await handle.drop()
})

async function log(receivedOn = '2027-07-02', actor: Actor = staff) {
  return await logRequest(
    handle.db,
    actor,
    {
      receivedOn: d(receivedOn),
      receivedVia: 'email',
      requesterName: 'Jordan Reyes',
      requesterContact: 'jordan@example.test',
      description: 'All permits issued on Birch Lane since 2024',
    },
    signal,
    NOW,
  )
}

async function loggedId(receivedOn = '2027-07-02'): Promise<string> {
  const r = await log(receivedOn)
  if (!r.ok) throw new Error(`log failed ${r.error}`)
  return r.value.requestId
}

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

describe('logging a request', () => {
  it('request received 2027-07-02 stores due 2027-07-12 with the RSA 91-A:4 IV(b) counting method', async () => {
    const r = await log()
    expect(r.ok && r.value.due).toBe('2027-07-12')
    expect(r.ok && r.value.number).toBe('RK-2027-0001')
    const [row] = await handle.db.select().from(rtkRequests)
    expect(row?.responseDue.due).toBe('2027-07-12')
    expect(row?.responseDue.ruleKey).toBe('nh.rtk.response')
    expect(row?.responseDue.countingMethod).toContain('5 business days after 2027-07-02')
    expect(row?.status).toBe('open')
  })

  it('a received date in the future is future_date', async () => {
    const r = await log('2027-07-20')
    expect(r).toEqual({ ok: false, error: 'future_date' })
  })

  it('reviewer and applicant cannot log a request', async () => {
    expect(await log('2027-07-02', reviewer)).toEqual({ ok: false, error: 'forbidden' })
    expect(await log('2027-07-02', applicant)).toEqual({ ok: false, error: 'forbidden' })
  })
})

describe('withholdings', () => {
  const base = (requestId: string) => ({
    requestId,
    scope: 'withheld_in_full' as const,
    recordDescription: 'Email from the town attorney about the Birch Lane variance',
    exemptionKey: 'nh.rtk.91a5.xii',
    explanation: 'The email is a confidential communication seeking legal advice from counsel.',
  })

  it('withholding citing 91-A:5 IV with a 12 character explanation is explanation_required', async () => {
    const requestId = await loggedId()
    const r = await recordWithholding(
      handle.db,
      staff,
      { ...base(requestId), exemptionKey: 'nh.rtk.91a5.iv', explanation: 'twelve chars' },
      signal,
    )
    expect(r).toEqual({ ok: false, error: 'explanation_required' })
  })

  it('other_law without a citation is citation_required', async () => {
    const requestId = await loggedId()
    const r = await recordWithholding(
      handle.db,
      staff,
      { ...base(requestId), exemptionKey: 'other_law' },
      signal,
    )
    expect(r).toEqual({ ok: false, error: 'citation_required' })
  })

  it('an unknown exemption key is unknown_exemption', async () => {
    const requestId = await loggedId()
    const r = await recordWithholding(
      handle.db,
      staff,
      { ...base(requestId), exemptionKey: 'nh.rtk.91a5.xiv' },
      signal,
    )
    expect(r).toEqual({ ok: false, error: 'unknown_exemption' })
  })

  it('a cited withholding is stored', async () => {
    const requestId = await loggedId()
    const r = await recordWithholding(handle.db, staff, base(requestId), signal)
    expect(r.ok).toBe(true)
    expect(await handle.db.select().from(rtkWithholdings)).toHaveLength(1)
  })

  it('a reviewer cannot record a withholding', async () => {
    const requestId = await loggedId()
    expect(await recordWithholding(handle.db, reviewer, base(requestId), signal)).toEqual({
      ok: false,
      error: 'forbidden',
    })
  })
})

describe('first responses', () => {
  it('denial without a withholding is withholding_required', async () => {
    const requestId = await loggedId()
    const r = await recordFirstResponse(
      handle.db,
      store,
      staff,
      { requestId, kind: 'denied', respondedOn: d('2027-07-09') },
      signal,
    )
    expect(r).toEqual({ ok: false, error: 'withholding_required' })
  })

  it('time statement sets stated_due and awaiting_decision', async () => {
    const requestId = await loggedId()
    const r = await recordFirstResponse(
      handle.db,
      store,
      staff,
      {
        requestId,
        kind: 'time_statement',
        respondedOn: d('2027-07-09'),
        timeStatement: {
          statedDate: d('2027-07-30'),
          delayReason: 'The records are in off-site storage and must be retrieved and reviewed.',
          costEstimate: [{ label: 'Copies, 120 pages', cents: 1200 }],
        },
      },
      signal,
    )
    expect(r.ok).toBe(true)
    const [row] = await handle.db.select().from(rtkRequests)
    expect(row?.status).toBe('awaiting_decision')
    expect(row?.statedDue?.due).toBe('2027-07-30')
    expect(row?.statedDue?.ruleKey).toBe('nh.rtk.stated_time')
    expect(row?.openDueOn).toBe('2027-07-30')
    if (r.ok) {
      const text = await letterText(r.value.letterDocumentId)
      expect(text).toContain('July 30, 2027')
      expect(text).toContain('off-site storage')
      expect(text).toContain('Copies, 120 pages')
    }
  })

  it('a time statement with a stated date before the response date is stated_date_required', async () => {
    const requestId = await loggedId()
    const r = await recordFirstResponse(
      handle.db,
      store,
      staff,
      {
        requestId,
        kind: 'time_statement',
        respondedOn: d('2027-07-09'),
        timeStatement: {
          statedDate: d('2027-07-01'),
          delayReason: 'The records are in off-site storage.',
          costEstimate: [],
        },
      },
      signal,
    )
    expect(r).toEqual({ ok: false, error: 'stated_date_required' })
  })

  it('a website reference without a url is website_url_required', async () => {
    const requestId = await loggedId()
    const r = await recordFirstResponse(
      handle.db,
      store,
      staff,
      { requestId, kind: 'website_reference', respondedOn: d('2027-07-09') },
      signal,
    )
    expect(r).toEqual({ ok: false, error: 'website_url_required' })
  })

  it('records made available close the response clock', async () => {
    const requestId = await loggedId()
    const r = await recordFirstResponse(
      handle.db,
      store,
      staff,
      { requestId, kind: 'made_available', respondedOn: d('2027-07-09') },
      signal,
    )
    expect(r.ok).toBe(true)
    const [row] = await handle.db.select().from(rtkRequests)
    expect(row?.status).toBe('responded')
    expect(row?.openDueOn).toBeNull()
    expect(row?.firstResponseKind).toBe('made_available')
    const again = await recordFirstResponse(
      handle.db,
      store,
      staff,
      { requestId, kind: 'made_available', respondedOn: d('2027-07-10') },
      signal,
    )
    expect(again).toEqual({ ok: false, error: 'already_responded' })
  })

  it('response on 2027-07-13 shows responded late', async () => {
    const requestId = await loggedId()
    const r = await recordFirstResponse(
      handle.db,
      store,
      staff,
      { requestId, kind: 'made_available', respondedOn: d('2027-07-13') },
      signal,
    )
    expect(r.ok).toBe(true)
    const view = await rtkRequestView(handle.db, staff, requestId, d('2027-07-14'), signal)
    expect(view.ok && view.value.timeliness).toEqual({
      kind: 'responded_late',
      dueOn: '2027-07-12',
      respondedOn: '2027-07-13',
    })
  })

  it('a response on the due date shows responded on time', async () => {
    const requestId = await loggedId()
    await recordFirstResponse(
      handle.db,
      store,
      staff,
      { requestId, kind: 'made_available', respondedOn: d('2027-07-12') },
      signal,
    )
    const view = await rtkRequestView(handle.db, staff, requestId, d('2027-07-14'), signal)
    expect(view.ok && view.value.timeliness.kind).toBe('responded_on_time')
  })

  it('letter text lists the exemption label and explanation', async () => {
    const requestId = await loggedId()
    await recordWithholding(
      handle.db,
      staff,
      {
        requestId,
        scope: 'withheld_in_full',
        recordDescription: 'Email from the town attorney',
        exemptionKey: 'nh.rtk.91a5.xii',
        explanation: 'The email is a confidential communication seeking legal advice.',
      },
      signal,
    )
    const r = await recordFirstResponse(
      handle.db,
      store,
      staff,
      { requestId, kind: 'denied', respondedOn: d('2027-07-09') },
      signal,
    )
    expect(r.ok).toBe(true)
    if (!r.ok) return
    const text = await letterText(r.value.letterDocumentId)
    expect(text).toContain('Attorney-client privileged communications and attorney work product')
    expect(text).toContain('RSA 91-A:5 XII')
    expect(text).toContain('The email is a confidential communication seeking legal advice.')
    expect(text).toContain('RK-2027-0001')
    expect(text).toContain('July 2, 2027')
  })

  it('a reviewer cannot record a first response', async () => {
    const requestId = await loggedId()
    const r = await recordFirstResponse(
      handle.db,
      store,
      reviewer,
      { requestId, kind: 'made_available', respondedOn: d('2027-07-09') },
      signal,
    )
    expect(r).toEqual({ ok: false, error: 'forbidden' })
  })
})

describe('who can see a request', () => {
  it('reviewer and applicant get 404 for a request', async () => {
    const requestId = await loggedId()
    expect((await rtkRequestView(handle.db, reviewer, requestId, d('2027-07-14'), signal)).ok).toBe(
      false,
    )
    expect(
      (await rtkRequestView(handle.db, applicant, requestId, d('2027-07-14'), signal)).ok,
    ).toBe(false)
    expect((await rtkRequestView(handle.db, staff, requestId, d('2027-07-14'), signal)).ok).toBe(
      true,
    )
  })

  it('the response letter document is visible to full roles only', async () => {
    const requestId = await loggedId()
    const r = await recordFirstResponse(
      handle.db,
      store,
      custodian,
      { requestId, kind: 'made_available', respondedOn: d('2027-07-09') },
      signal,
    )
    if (!r.ok) throw new Error('response failed')
    const visibleTo = async (actor: Actor | null) =>
      (
        await handle.db
          .select({ id: documents.id })
          .from(documents)
          .where(and(eq(documents.id, r.value.letterDocumentId), documentVisibleTo(actor)))
      ).length
    expect(await visibleTo(custodian)).toBe(1)
    expect(await visibleTo(reviewer)).toBe(0)
    expect(await visibleTo(applicant)).toBe(0)
    expect(await visibleTo(null)).toBe(0)
  })

  it('list with 30 requests and a cap of 25 shows only requests the viewer may see', async () => {
    for (let i = 0; i < 30; i += 1) await loggedId('2027-07-02')
    const page = await listRtkRequests(handle.db, staff, { filters: {}, limit: 25 }, signal)
    expect(page.rows).toHaveLength(25)
    expect(page.nextCursor).not.toBeNull()
    const rest = await listRtkRequests(
      handle.db,
      staff,
      { filters: {}, limit: 25, cursor: page.nextCursor ?? undefined },
      signal,
    )
    expect(rest.rows).toHaveLength(5)
    expect(rest.nextCursor).toBeNull()
    const hidden = await listRtkRequests(handle.db, reviewer, { filters: {}, limit: 25 }, signal)
    expect(hidden.rows).toEqual([])
    expect(hidden.nextCursor).toBeNull()
  })

  it('overdue only lists open requests past their due date', async () => {
    await loggedId('2027-07-02')
    await loggedId('2027-07-12')
    const overdue = await listRtkRequests(
      handle.db,
      staff,
      { filters: { overdueOnly: true }, limit: 25, today: d('2027-07-14') },
      signal,
    )
    expect(overdue.rows.map((r) => r.number)).toEqual(['RK-2027-0001'])
  })
})
